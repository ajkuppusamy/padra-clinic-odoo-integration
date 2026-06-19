import { ForbiddenException, Injectable, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import { OdooService as OdooLibService } from '@libs/odoo/odoo.service';
import { QueueRepository, RequestRepository, ResponseRepository } from '@common/repositories';
import {
  ContactSearchResponse,
  CreateContactRequest,
  CreateContactResponse,
  CreateProductRequest,
  CreateQuotationRequest,
  ISO8601Date,
  SearchReadParams,
  ValsList,
  UpdateContactRequest,
  UpdateProductRequest,
  CompanySearchResponse,
  SearchSalesOrderWrite,
  QuoteCvtInvoice,
  BaseSearch,
} from '@libs/odoo/interfaces';
import { getSaleServiceTypeValue } from '@libs/odoo/config/service-type.config';
import { getTreatmentCategoryValue } from '@libs/odoo/config/treatment-category.config';
import { RequestType, RequestStatus, ResponseStatus, SourceType, QueueStatus, QueueType } from '@common/entities';
import { AwsSqsProducerService } from '@libs/aws_sqs/producer.service';
import { ConfigService } from '@nestjs/config';
import { HubspotService } from '@modules/hubspot/hubspot.service';
import { OdooWebhookHandleDto } from './dto/odoo-webhook.dto';
import { SimplePublicObject } from '@hubspot/api-client/lib/codegen/crm/companies';

@Injectable()
export class OdooService {
  private readonly logger = new Logger(OdooService.name);

  constructor(
    private readonly sqsProducerService: AwsSqsProducerService,
    private readonly odooLibService: OdooLibService,
    private readonly requestRespository: RequestRepository,
    private readonly responseRespository: ResponseRepository,
    private readonly queueRepository: QueueRepository,
    private readonly configService: ConfigService,
    private readonly hubService: HubspotService,
  ) {}

  async handlingWebhook(eventName: string, body: OdooWebhookHandleDto) {
    const method = this.handlingWebhook.name;
    const sqsUrl = this.configService.get<string>('AWS_Q1_QUEUE_URL') ?? '';

    if (!sqsUrl) {
      this.logger.error(`[${method}] Missing SQS URL`);
      throw new Error('SQS configuration error');
    }
    this.logger.debug(`[${method}] Full webhook body: ` + JSON.stringify(body));
    this.logger.debug(`[${method}] Event type: ${eventName}`);
    const payload = {
      ...body,
      eventType: eventName,
    };
    this.logger.debug(`data : ${JSON.stringify(payload)}`);
    try {
      const record = await this.queueRepository.saveQueueItem(
        this.queueRepository.create({
          payload,
          queueType: QueueType.WEBHOOK,
          sourceType: SourceType.ODOO,
          status: QueueStatus.QUEUED,
          event: eventName,
          externalId: body?.['invoice_id'] ?? body?.['product_id'] ?? body?.['quotation_id'] ?? body.id ?? body.move_id ?? body.order_id ?? null,
        }),
      );
      await this.sqsProducerService.sendMessage(sqsUrl, record.jobId, payload, eventName);

      this.logger.log(`[${method}] Queued`, {
        jobId: record.jobId,
        eventType: eventName,
      });

      return { success: true, jobId: record.jobId };
    } catch (error) {
      this.logger.error(`[${method}] Failed`, {
        eventType: eventName,
        error: error?.['message'],
      });

      return { success: false, error: error?.['message'] };
    }
  }

  private buildContactProperties(properties: Record<string, any>): CreateContactRequest {
    this.logger.debug(`${this.buildContactProperties.name} Keys: ${Object.keys(properties)}`);

    return {
      email: properties.email ?? '',
      company_name: properties.company_name ?? new Date().getMilliseconds().toString(),
      name: properties.firstname ?? '',
      address: properties.address ?? '',
      city: properties.city ?? '',
      country: properties.country ?? '',
      phone: properties.phone ?? '',
      postal_code: properties.zip ?? '',
      state: properties.state ?? '',
    };
  }

  private async checkExistContact(jobId: string, email: string): Promise<string> {
    const payload: SearchReadParams = {
      domain: [['email', '=', email]],
      fields: ['display_name', 'email', 'hubspot_contact_id'],
      limit: 20,
    };
    const existcontact = await this.searchContact(jobId, payload, email);
    return existcontact[0]?.hubspot_contact_id;
  }

  async searchContact(jobId: string, properties: SearchReadParams, property: string): Promise<ContactSearchResponse[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/search_read', 'POST', properties, () =>
      this.odooLibService.search(properties, '/search_read'),
    ) as unknown as ContactSearchResponse[];
  }

  private async waitForResponses(jobId: string) {
    this.logger.log(`${this.waitForResponses.name} : ${jobId}`);
    for (let i = 0; i < 10; i++) {
      const requests = await this.requestRespository.findByJobId(jobId);

      const allDone = requests.every((r) => r.status === RequestStatus.SUCCESS || r.status === RequestStatus.FAILED);

      if (allDone) return requests;

      await new Promise((res) => setTimeout(res, 500));
    }

    return [];
  }

  public async listProductbyCompanyName(companyName: string, page = 1, limit = 100) {
    const companyPayload: SearchReadParams = {
      domain: [['display_name', 'ilike', `${companyName?.toLowerCase()}`]] as any,
      fields: ['id', 'display_name', 'name'],
    };

    const queue = await this.queueRepository
      .create({
        sourceType: SourceType.HUBSPOT,
        queueType: QueueType.LIST,
        payload: companyPayload,
        status: QueueStatus.QUEUED,
        event: 'UI_EXTENSION',
      })
      .save();

    const jobId = queue.jobId;

    const searchCompany = await this.searchCompanyByName(jobId, companyPayload, 'display_name');

    const companyId = searchCompany?.[0]?.['id'];

    if (!companyId) {
      await this.queueRepository.updateStatus(jobId, QueueStatus.SKIPPED, undefined, 'Company not found');

      return {
        data: [],
      };
    }

    const productPayload: SearchReadParams = {
      ids: [companyId],
      fields: ['id', 'name', 'display_name', 'list_price', 'company_id', 'base_unit_price'],
    };

    await this.searchProductByCompanyId(jobId, productPayload, 'company_id');

    const requests = await this.waitForResponses(jobId);
    const requestIds = requests.map((r) => r.id);

    const responses = requestIds.length > 0 ? await this.responseRespository.findByRequestIds(requestIds) : [];

    const normalize = (data: any): any[] => {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.result)) return data.result;
      if (Array.isArray(data.data)) return data.data;
      return [];
    };

    const products = responses
      .filter((r) => r.status === ResponseStatus.SUCCESS && r.data)
      .flatMap((r) => normalize(r.data))
      .filter((item) => {
        return item && typeof item === 'object' && (item.list_price !== undefined || item.company_id !== undefined);
      });

    const offset = (page - 1) * limit;
    const paginated = products.slice(offset, offset + limit);

    const total = products.length;
    const hasNext = offset + limit < total;
    const hasPrev = page > 1;

    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED, undefined, 'Product search success');

    return {
      products: paginated,
      pagination: {
        page,
        limit,
        total,
        hasNext,
        hasPrev,
        nextPage: hasNext ? page + 1 : null,
        prevPage: hasPrev ? page - 1 : null,
      },
    };
  }

  private buildEmptyResponse(message: string, page: number, limit: number, branch?: string | null) {
    return {
      success: false,
      message,
      branch: branch || null,
      products: [],
      pagination: {
        page,
        limit,
        total: 0,
        hasNext: false,
        hasPrev: false,
        nextPage: null,
        prevPage: null,
      },
    };
  }

  private getCompanyIdForPipeline(pipelineId: number | string): number | undefined {
    const pipelineCompanyMap: Record<string, number> = JSON.parse(this.configService.get<string>('HUBSPOT_PIPELINE_ODOO_COMPANY_MAP') || '{}');
    return pipelineCompanyMap[pipelineId];
  }

  private async createListQueue(companyId: number) {
    return this.queueRepository
      .create({
        sourceType: SourceType.HUBSPOT,
        queueType: QueueType.LIST,
        payload: { companyId },
        status: QueueStatus.QUEUED,
        event: 'UI_EXTENSION',
      })
      .save();
  }

  private normalizeResponseData(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.result)) return data.result;
    if (Array.isArray(data.data)) return data.data;
    return [];
  }

  private async fetchProductsForCompany(jobId: string, companyId: number) {
    const productPayload: SearchReadParams = {
      domain: [['company_id', '=', companyId]] as any,
      fields: ['id', 'name', 'display_name', 'list_price', 'company_id', 'base_unit_price', 'taxes_id'],
    };
    delete productPayload.fields;

    await this.searchProductByCompanyId(jobId, productPayload, 'company_id');

    const requests = await this.waitForResponses(jobId);
    if (!requests?.length) {
      return null;
    }

    const requestIds = requests.map((r) => r.id);
    const responses = requestIds.length > 0 ? await this.responseRespository.findByRequestIds(requestIds) : [];

    if (!responses?.length) {
      return null;
    }

    return responses
      .filter((r) => r.status === ResponseStatus.SUCCESS && r.data)
      .flatMap((r) => this.normalizeResponseData(r.data))
      .filter((item) => item && typeof item === 'object' && (item.list_price !== undefined || item.company_id !== undefined));
  }

  private async fetchTaxesForProducts(jobId: string, products: any[]) {
    const allTaxIds = [...new Set(products.flatMap((product) => product.taxes_id || []))];

    if (!allTaxIds.length) {
      return [];
    }

    const taxResponse = await this.taxRead(jobId, {
      ids: allTaxIds,
      fields: ['display_name', 'name', 'create_date', 'company_id'],
    });

    return taxResponse?.['result'] || taxResponse?.['data'] || (Array.isArray(taxResponse) ? taxResponse : []);
  }

  private attachTaxesToProducts(products: any[], taxes: any[]) {
    return products.map((product) => {
      const productCompanyId = product.company_id?.[0];
      const companyTaxes = taxes.filter((tax) => product.taxes_id?.includes(tax.id) && tax.company_id?.[0] === productCompanyId);
      return { ...product, companyTaxes };
    });
  }

  private paginateProducts(products: any[], page: number, limit: number) {
    const offset = (page - 1) * limit;
    const paginated = products.slice(offset, offset + limit);
    const total = products.length;
    const hasNext = offset + limit < total;
    const hasPrev = page > 1;

    return {
      paginated,
      pagination: {
        page,
        limit,
        total,
        hasNext,
        hasPrev,
        nextPage: hasNext ? page + 1 : null,
        prevPage: hasPrev ? page - 1 : null,
      },
    };
  }

  public async listProductbyPipelineId(dealId: number, pipelineId: number | string, page = 1, limit = 100) {
    const companyId = this.getCompanyIdForPipeline(pipelineId);
    if (!companyId) {
      return this.buildEmptyResponse('Company mapping not found', page, limit);
    }

    const queue = await this.createListQueue(companyId);
    const jobId = queue.jobId;

    const deal = await this.hubService.fetchDeal(dealId.toString(), jobId);
    if (!deal) {
      return this.buildEmptyResponse('Deal not found', page, limit);
    }

    const branch = deal?.properties?.branch as string;

    const products = await this.fetchProductsForCompany(jobId, companyId);
    if (!products) {
      return this.buildEmptyResponse(`No requests/responses found for branch: ${branch}`, page, limit, branch);
    }
    if (!products.length) {
      return this.buildEmptyResponse(`Products not found for branch: ${branch}`, page, limit, branch);
    }

    const taxes = await this.fetchTaxesForProducts(jobId, products);
    const productsWithTaxes = this.attachTaxesToProducts(products, taxes);

    const { paginated, pagination } = this.paginateProducts(productsWithTaxes, page, limit);

    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED, undefined, 'Product search success');

    return {
      success: true,
      message: `Products fetched successfully for branch: ${branch}`,
      branch,
      products: paginated,
      pagination,
    };
  }

  async searchProductByCompanyId(jobId: string, payload: SearchReadParams, property: string) {
    try {
      return await this.productSearch(jobId, payload, property);
    } catch (error: any) {
      const message = (error?.message || '').toLowerCase();

      this.logger.error('[ODOO ERROR CAUGHT]', {
        jobId,
        message,
      });

      if (message.includes('401') || message.includes('unauthorized') || message.includes('invalid apikey')) {
        throw new UnauthorizedException('Invalid or expired API key');
      }

      if (message.includes('403') || message.includes('forbidden')) {
        throw new ForbiddenException('Access denied');
      }

      throw new InternalServerErrorException(message || 'Odoo request failed');
    }
  }

  async searchCompanyByName(jobId: string, payload: SearchReadParams, property: string) {
    try {
      return await this.executeTrackedRequest(jobId, RequestType.SEARCH, property, 'pres.company/search_read', 'POST', payload, () =>
        this.odooLibService.search(payload, '/res.company/search_read'),
      );
    } catch (error: any) {
      const message = (error?.message || '').toLowerCase();

      this.logger.error('[ODOO ERROR CAUGHT]', {
        jobId,
        message,
      });

      if (message.includes('401') || message.includes('unauthorized') || message.includes('invalid apikey')) {
        throw new UnauthorizedException('Invalid or expired API key');
      }

      if (message.includes('403') || message.includes('forbidden')) {
        throw new ForbiddenException('Access denied');
      }

      throw new InternalServerErrorException(message || 'Odoo request failed');
    }
  }

  async contactProcess(properties: Record<string, any>, jobId: string): Promise<string> {
    const payload = this.buildContactProperties(properties);

    if (!payload.email) {
      this.logger.warn(`[contactProcess] Missing email, jobId: ${jobId}`);
      return '';
    }

    this.logger.log(`[contactProcess] Processing contact: ${payload.email}, jobId: ${jobId}`);

    const existsOdooContactId = await this.checkExistContact(jobId, payload.email);
    const hubspotContactId = properties?.hs_object_id;

    if (existsOdooContactId) {
      if (hubspotContactId) {
        await this.hubService.updateContactById(jobId, hubspotContactId, {
          odoo_contact_id: existsOdooContactId,
        });
      }

      return existsOdooContactId;
    }

    const created = await this.createContact(jobId, payload);
    await this.hubService.updateContactById(jobId, hubspotContactId, {
      odoo_contact_id: created?.contact_id,
    });
    return created?.contact_id ?? '';
  }

  async partnerSyncProcess(jobId: string, properties: Record<string, any>): Promise<string> {
    const payload = this.buildContactProperties(properties);

    if (!payload.email) {
      this.logger.warn(`[partnerSyncProcess] Missing email, jobId: ${jobId}`);
      return '';
    }

    const partnerSearchPayload: SearchReadParams = {
      domain: [['email', '=', payload.email]],
      fields: ['display_name', 'email', 'id'],
      limit: 1,
    };

    const existingPartners = await this.partnerSearch(jobId, partnerSearchPayload, payload.email);

    const existingPartnerId = existingPartners?.[0]?.id;

    if (existingPartnerId) {
      this.logger.log(`[partnerSyncProcess] Partner already exists, email: ${payload.email}, partnerId: ${existingPartnerId}, jobId: ${jobId}`);

      return existingPartnerId.toString();
    }

    delete payload.state;
    delete payload.postal_code;
    delete payload.country;
    delete payload.address;

    const createdPartners = await this.partnerCreate(jobId, { vals_list: [payload] }, payload.email);

    const createdPartnerId = createdPartners?.[0];

    if (!createdPartnerId) {
      this.logger.error(`[partnerSyncProcess] Partner creation failed, email: ${payload.email}, jobId: ${jobId}`);
      return '';
    }

    this.logger.log(`[partnerSyncProcess] Partner created successfully, email: ${payload.email}, partnerId: ${createdPartnerId}, jobId: ${jobId}`);

    return createdPartnerId.toString();
  }

  async createContact(jobId: string, properties: CreateContactRequest): Promise<CreateContactResponse> {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_CONTACT, properties.email, '/contact', 'POST', properties, () => this.odooLibService.createContact(properties));
  }

  async updateContact(jobId: string, contactId: string, properties: UpdateContactRequest) {
    return this.executeTrackedRequest(jobId, RequestType.UPDATE_CONTACT, contactId, `/contacts/${contactId}`, 'PUT', properties, () =>
      this.odooLibService.updateContact(contactId, properties),
    );
  }

  async buildQuotationProperties(odooContactId: string, lineItemProperties: any[]): Promise<CreateQuotationRequest> {
    this.logger.debug(`${this.buildQuotationProperties.name} ContactId=${odooContactId}`);

    const lineItems = lineItemProperties.map((item: any) => ({
      description: item.name ?? item.hs_sku ?? 'No description',
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.price) || 0,
      product_id: item.odoo_product_id ?? item.hs_product_id,
      tax_rate: item.tax_rate ? Number(item.tax_rate) : 5.0,
    }));

    return {
      contact_id: odooContactId,
      quotation_date: new Date().toISOString().split('T')[0] as ISO8601Date,
      validity_period: 30,
      line_items: lineItems,
    };
  }

  async createQuotation(jobId: string, properties: CreateQuotationRequest) {
    return await this.executeTrackedRequest(jobId, RequestType.CREATE_QUOTATION, properties.contact_id, `/quotations`, 'POST', properties, () =>
      this.odooLibService.createQuotation(properties),
    );
  }

  async ProcessQuotationtoInvoice(jobId: string, quotationId: string) {
    return await this.executeTrackedRequest(jobId, RequestType.CREATE_INVOICE, quotationId, `/quotations/${quotationId}/convert`, 'POST', {}, () =>
      this.odooLibService.convertQuotationToInvoice(quotationId),
    );
  }

  async processQuotation(jobId: string, odooContactId: string, lineItemProperties: {}[]) {
    const properties: CreateQuotationRequest = await this.buildQuotationProperties(odooContactId, lineItemProperties);

    this.logger.debug(`${this.processQuotation.name} properties=${JSON.stringify(properties)}`);

    return await this.createQuotation(jobId, properties);
  }

  async createProduct(jobId: string, properties: CreateProductRequest) {
    return await this.executeTrackedRequest(jobId, RequestType.CREATE_PRODUCT, null, `/products`, 'POST', properties, () => this.odooLibService.createProduct(properties));
  }

  async updateProuctById(jobId: string, productId: string, properties: UpdateProductRequest) {
    return await this.executeTrackedRequest(jobId, RequestType.UPDATE_PRODUCT, productId, `/products/${productId}`, 'PUT', properties, () =>
      this.odooLibService.updateProduct(productId, properties),
    );
  }

  async processCountry(jobId: string, country: string, property: string): Promise<string | number> {
    const payload: SearchReadParams = {
      domain: [['display_name', 'Ilike', country]],
      fields: ['display_name', 'id'],
    };
    const countryData = await this.countrySearch(jobId, payload, property);
    const id = countryData.find((v) => v.display_name?.toLowerCase() === country?.toLowerCase()?.trim())?.id;
    return id ?? '';
  }

  async procesState(jobId: string, state: string, property: string): Promise<string | number> {
    const payload: SearchReadParams = {
      domain: [['display_name', 'Ilike', state]],
      fields: ['display_name', 'id'],
    };
    const stateData = await this.stateSearch(jobId, payload, property);
    const id = stateData.find((v) => v.display_name?.toLowerCase() === state?.toLowerCase()?.trim())?.id;
    return id ?? '';
  }

  async buildOdooObjectPayload(
    properties: SimplePublicObject,
    companyId?: number | string,
    isWrite = false,
    object?: 'contacts' | 'deals' | 'invoice' | 'invoice_cvt',
    {
      contactId,
      deal_owner_id,
      call_centre_deal_owner_id,
      odooServicePlanTypeId,
    }: { contactId?: number; deal_owner_id?: number; call_centre_deal_owner_id?: number; odooServicePlanTypeId?: string } = {},
    lineItems?: SimplePublicObject[],
    odooQuoteId?: number,
    odooInvoiceId?: string | number,
    jobId?: string,
  ): Promise<ValsList | SearchReadParams | QuoteCvtInvoice> {
    const email = properties?.properties?.email;
    const pipeline = properties?.properties?.pipeline;
    this.logger.debug(`email -${email} , pipeline: ${pipeline}`);
    if (!isWrite) {
      return {
        domain: [email ? ['email', 'ilike', email] : ['name', 'ilike', pipeline]],
        fields: ['display_name', 'id', 'name', 'email'],
        limit: 1,
      };
    }

    if (object === 'contacts') {
      const state = properties?.properties?.state ?? '';
      const country = properties?.properties?.country ?? '';
      const stateId = await this.procesState(jobId as string, state as string, 'state');
      const coutryId = await this.processCountry(jobId as string, country as string, 'country');
      return {
        vals_list: [
          {
            email: email ?? '',
            name: [properties?.properties?.firstname, properties?.properties?.lastname].filter(Boolean).join(' '),
            company_id: String(companyId ?? ''),
            autopost_bills: 'never',
            street: properties?.properties?.street ?? '',
            city: properties?.properties?.city ?? '',
            zip: properties?.properties?.zip ?? '',
            mrn_no: properties?.properties?.mrn_number,
            contact_address: properties?.properties?.address ?? '',
            country_id: coutryId,
            state_id: stateId,
          },
        ],
      };
    }

    const mappedLines = (lineItems ?? [])
      .map((item) => {
        const productId = Number(item?.properties?.odoo_product_id) as unknown as number;
        if (!productId) return null;
        return {
          product_id: productId,
          name: item?.properties?.name ?? 'Item',
          quantity: Number(item?.properties?.quantity ?? 1),
          price_unit: Number(item?.properties?.price ?? 0),
        };
      })
      .filter(Boolean);

    if (object === 'deals') {
      const serviceType = properties?.properties?.service_type as string;
      const treatmentCategory = properties?.properties?.treatment_category as string;
      const sale_service_type_id = getSaleServiceTypeValue(serviceType);
      const sale_treatment_category_id = getTreatmentCategoryValue(treatmentCategory);
      this.logger.debug(
        `serviceType: ${serviceType}, treatmentCategory: ${treatmentCategory}, sale_service_type_id: ${sale_service_type_id}, sale_treatment_category_id: ${sale_treatment_category_id}`,
      );
      const isOdooPropertymap = (await this.configService.get<string>('IS_ODOO_PROPERTY_MAP'))?.toLowerCase() === 'true';
      const dealProperties = isOdooPropertymap
        ? {
            sale_service_type_id,
            sale_treatment_category_id,
            // smr_amount_discount: Number(properties?.properties?.discount_amount ?? 0), // this property is currently not mapped in odoo, need to create custom field and map it in odoo before using this
            no_of_hairs: Number(properties?.properties?.number_of_hairs ?? properties?.properties?.number_of_hairs___cloned_ ?? 0),
            session: Number(properties?.properties?.number_of_sessions ?? 0),
            sessions_completed: Number(properties?.properties?.sessions_completed ?? 0),
            deal_owner_id,
            call_centre_deal_owner_id,
          }
        : {};

      return {
        vals_list: [
          {
            ...dealProperties,
            company_id: Number(companyId ?? 0),
            partner_id: Number(contactId ?? 0),
            partner_shipping_id: Number(contactId ?? 0),
            partner_invoice_id: Number(contactId ?? 0),
            // warehouse_id: 1,
            date_order: new Date().toISOString().replace('T', ' ').split('.')[0],
            order_line: mappedLines.map((line) => [
              0,
              0,
              {
                product_id: Number(line!.product_id),
                name: line!.name,
                product_uom_qty: Number(line!.quantity),
                price_unit: Number(line!.price_unit),
                analytic_distribution: odooServicePlanTypeId
                  ? {
                      [odooServicePlanTypeId]: 100,
                    }
                  : {},
              },
            ]),
          },
        ],
      };
    }

    if (object === 'invoice') {
      return {
        vals_list: [
          {
            move_type: 'out_invoice',
            partner_id: Number(contactId ?? 0),
            invoice_date: new Date().toISOString().split('T')[0],

            invoice_line_ids: mappedLines.map((line) => [
              0,
              0,
              {
                product_id: Number(line!.product_id),
                name: line!.name,
                quantity: Number(line!.quantity),
                price_unit: Number(line!.price_unit),
              },
            ]),
          },
        ],
      };
    }

    if (object === 'invoice_cvt') {
      return {
        ids: [odooQuoteId as number],
        vals: {
          invoice_ids: [odooInvoiceId as number],
        },
      };
    }
    throw new Error('Invalid payload configuration');
  }

  async saleOrderCreation(jobId: string, properties: ValsList, property: string): Promise<number[]> {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_QUOTATION, property, '/sale.order/create', 'POST', properties, () =>
      this.odooLibService.search(properties, '/sale.order/create'),
    ) as unknown as number[];
  }

  async saleOrderRead(jobId: string, properties: {}, property: string): Promise<BaseSearch[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/sale.order/read', 'POST', properties, () =>
      this.odooLibService.search(properties, '/sale.order/read'),
    ) as unknown as BaseSearch[];
  }

  async saleOrderConformation(jobId: string, properties: {}, property: string): Promise<number[]> {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_QUOTATION, property, '/sale.order/action_confirm', 'POST', properties, () =>
      this.odooLibService.search(properties, '/sale.order/action_confirm'),
    ) as unknown as number[];
  }

  async saleOrderWrite(jobId: string, properties: SearchSalesOrderWrite, property: string): Promise<boolean> {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_QUOTATION, property, '/sale.order/write', 'POST', properties, () =>
      this.odooLibService.search(properties, '/sale.order/write'),
    ) as unknown as boolean;
  }

  async partnerCreate(jobId: string, properties: ValsList, property: string): Promise<number[]> {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_CONTACT, property, '/res.partner/create', 'POST', properties, () =>
      this.odooLibService.search(properties, '/res.partner/create'),
    ) as unknown as number[];
  }

  async partnerSearch(jobId: string, properties: SearchReadParams, property: string): Promise<ContactSearchResponse[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/res.partner/search_read', 'POST', properties, () =>
      this.odooLibService.search(properties, '/res.partner/search_read'),
    ) as unknown as ContactSearchResponse[];
  }

  async companySearch(jobId: string, properties: SearchReadParams, property: string): Promise<CompanySearchResponse[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/res.company/search_read', 'POST', properties, () =>
      this.odooLibService.search(properties, '/res.company/search_read'),
    ) as unknown as CompanySearchResponse[];
  }

  async paymentSearch(jobId: string, properties: SearchReadParams, property: string): Promise<BaseSearch[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/account.payment', 'POST', properties, () =>
      this.odooLibService.search(properties, '/account.payment/search_read'),
    ) as unknown as BaseSearch[];
  }

  async countrySearch(jobId: string, properties: SearchReadParams, property: string): Promise<BaseSearch[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/res.country/search_read', 'POST', properties, () =>
      this.odooLibService.search(properties, '/res.country/search_read'),
    ) as unknown as BaseSearch[];
  }
  async taxRead(jobId: string, properties: SearchReadParams): Promise<BaseSearch[]> {
    return (await this.executeTrackedRequest(jobId, RequestType.TAX_READ, 'ids', `/account.tax/read`, 'POST', properties, () =>
      this.odooLibService.search(properties, '/account.tax/read'),
    )) as unknown as BaseSearch[];
  }

  async stateSearch(jobId: string, properties: SearchReadParams, property: string): Promise<BaseSearch[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/res.country.state/search_read', 'POST', properties, () =>
      this.odooLibService.search(properties, '/res.country.state/search_read'),
    ) as unknown as BaseSearch[];
  }

  async readCompanyByIds(jobId: string, properties: SearchReadParams, property: string): Promise<CompanySearchResponse[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/res.company', 'POST', properties, () =>
      this.odooLibService.search(properties, '/res.company/read'),
    ) as unknown as CompanySearchResponse[];
  }

  async salesOrderDiscountSearch(jobId: string, properties: SearchReadParams, property: string): Promise<BaseSearch[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/sale.order.discount/search_read', 'POST', properties, () =>
      this.odooLibService.search(properties, '/sale.order.discount/search_read'),
    ) as unknown as BaseSearch[];
  }

  async salesOrderDiscountCreate(jobId: string, properties: ValsList, property: string): Promise<number[]> {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_DISCOUNT, property, '/sale.order.discount/create', 'POST', properties, () =>
      this.odooLibService.search(properties, '/sale.order.discount/create'),
    ) as unknown as number[];
  }

  async salesOrderDiscountConformation(jobId: string, properties: { ids: number[]; context: {} }, property: string): Promise<null> {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_DISCOUNT, property, '/sale.order.discount/action_apply_discount', 'POST', properties, () =>
      this.odooLibService.search(properties, '/sale.order.discount/action_apply_discount'),
    ) as unknown as null;
  }

  async accountInvoiceCreate(jobId: string, properties: ValsList, property: string): Promise<number[]> {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_INVOICE, property, '/account.move/create', 'POST', properties, () =>
      this.odooLibService.search(properties, '/account.move/create'),
    ) as unknown as number[];
  }

  async paymentInvoiceCreate(jobId: string, properties: ValsList, property: string): Promise<number[]> {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_INVOICE, property, '/sale.advance.payment.inv/create', 'POST', properties, () =>
      this.odooLibService.search(properties, '/sale.advance.payment.inv/create'),
    ) as unknown as number[];
  }

  async getFileBySalesOrderId(jobId: string, salesOrderId: string, property: string): Promise<any> {
    return this.executeTrackedRequest(jobId, RequestType.FILE_READ, property, `/report/pdf/sale.report_saleorder_pro_forma/${salesOrderId}`, 'GET', undefined, () =>
      this.odooLibService.salesOrderBufferget(`/report/pdf/sale.report_saleorder_pro_forma/${salesOrderId}`),
    ) as unknown as any;
  }

  async paymentInvoiceValidate(jobId: string, properties: ValsList | {}, property: string): Promise<number[]> {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_INVOICE, property, '/sale.advance.payment.inv/create_invoices', 'POST', properties, () =>
      this.odooLibService.search(properties, '/sale.advance.payment.inv/create_invoices'),
    ) as unknown as number[];
  }

  async accountAnalyticSearch(jobId: string, properties: SearchReadParams, property: string): Promise<BaseSearch[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/account.analytic.account/search_read', 'POST', properties, () =>
      this.odooLibService.search(properties, '/account.analytic.account/search_read'),
    ) as unknown as BaseSearch[];
  }

  async accountAnalyticPlanSearch(jobId: string, properties: SearchReadParams, property: string): Promise<BaseSearch[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/account.analytic.plan/search_read', 'POST', properties, () =>
      this.odooLibService.search(properties, '/account.analytic.plan/search_read'),
    ) as unknown as BaseSearch[];
  }

  async getProductTemplateSearch(jobId: string, properties: SearchReadParams, property: string): Promise<BaseSearch[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/product.template/search_read', 'POST', properties, () =>
      this.odooLibService.search(properties, '/product.template/search_read'),
    ) as unknown as BaseSearch[];
  }

  async productSearch(jobId: string, properties: SearchReadParams, property: string): Promise<BaseSearch[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/product.product/search_read', 'POST', properties, () =>
      this.odooLibService.search(properties, '/product.product/search_read'),
    ) as unknown as BaseSearch[];
  }

  private async executeTrackedRequest<T>(
    jobId: string,
    requestType: RequestType,
    externalId: string | null,
    endpoint: string,
    method: string,
    payload: any,
    handler: () => Promise<T>,
  ): Promise<T> {
    const start = Date.now();

    const request = await this.requestRespository.saveRequest(
      this.requestRespository.create({
        jobId,
        requestType,
        externalId,
        targetSystem: SourceType.ODOO,
        endpoint,
        method,
        payload,
        status: RequestStatus.PROCESSING,
      }),
    );

    try {
      const result = await handler();

      await this.responseRespository.saveResponse(
        this.responseRespository.create({
          requestId: request.id,
          jobId,
          statusCode: 200,
          status: ResponseStatus.SUCCESS,
          data: result,
          durationMs: Date.now() - start,
        }),
      );

      await this.requestRespository.updateStatus(request.id, RequestStatus.SUCCESS);

      return result;
    } catch (error: any) {
      await this.responseRespository.saveResponse(
        this.responseRespository.create({
          requestId: request.id,
          jobId,
          statusCode: error?.['status'] || 500,
          status: ResponseStatus.ERROR,
          error,
          durationMs: Date.now() - start,
        }),
      );

      await this.requestRespository.updateStatus(request.id, RequestStatus.FAILED, JSON.stringify(error));

      await this.requestRespository.incrementRetryCount(request.id);

      throw error;
    }
  }
}
