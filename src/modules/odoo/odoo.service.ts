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
  Contact,
  SalesOrder,
  OrderLine,
} from '@libs/odoo/interfaces';
import { RequestType, RequestStatus, ResponseStatus, SourceType, QueueStatus, QueueType, Response } from '@common/entities';
import { AwsSqsProducerService } from '@libs/aws_sqs/producer.service';
import { ConfigService } from '@nestjs/config';
import { HubspotService } from '@modules/hubspot/hubspot.service';
import { OdooWebhookDto } from './dto/odoo-webhook.dto';
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

  async handlingWebhook(eventName: string, body: OdooWebhookDto) {
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
          externalId: body?.invoice_id ?? body?.product_id ?? body?.quotation_id,
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

  async searchProductByCompanyId(jobId: string, payload: SearchReadParams, property: string) {
    try {
      return await this.executeTrackedRequest(jobId, RequestType.SEARCH, property, 'product.template/read', 'POST', payload, () =>
        this.odooLibService.search(payload, '/product.template/read'),
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

  async buildOdooObjectSearchPayload(
    properties: SimplePublicObject,
    companyId?: number | string,
    isWrite = false,
    object?: 'contacts' | 'companies' | 'deals',
    contactId?: number | string,
    lineItems?: SimplePublicObject[],
  ): Promise<ValsList | SearchReadParams> {
    const email = properties?.properties?.email ?? null;
    const pipeline = properties?.properties?.pipeline ?? null;

    if (!isWrite) {
      const domainCondition: [string, string, any] = email ? ['email', 'ilike', email] : ['name', 'ilike', pipeline];

      return {
        domain: [domainCondition],
        fields: ['display_name', 'id', 'name', 'email'],
        limit: 1,
      };
    }

    if (object === 'contacts') {
      const contact: Contact = {
        email: email ?? '',
        company_id: String(companyId ?? ''),
        autopost_bills: 'never',
        street: properties?.properties?.street ?? undefined,
        city: properties?.properties?.city ?? undefined,
        zip: properties?.properties?.zip ?? undefined,
      };

      return {
        vals_list: [contact],
      };
    }

    if (object === 'deals') {
      const orderLines: [number, number, OrderLine][] = (lineItems ?? [])
        .map((item) => {
          const productId = Number(item?.properties?.odoo_product_id);

          if (!productId) return null;

          return [
            0,
            0,
            {
              product_id: productId,
              name: item?.properties?.name ?? 'Item',
              price_unit: Number(item?.properties?.price ?? 0),
              product_uom_qty: Number(item?.properties?.quantity ?? 1),
            },
          ] as [number, number, OrderLine];
        })
        .filter(Boolean) as [number, number, OrderLine][];

      const deal: SalesOrder = {
        company_id: Number(companyId ?? 0),
        partner_id: Number(contactId ?? 0),
        partner_shipping_id: Number(contactId ?? 0),
        partner_invoice_id: Number(contactId ?? 0),
        warehouse_id: 1, //  ensure exists in Odoo
        date_order: new Date().toISOString(),
        order_line: orderLines,
      };

      return {
        vals_list: [deal],
      };
    }

    // FINAL SAFETY (important for TS)
    throw new Error('Invalid payload configuration');
  }

  async searchSaleOrderCreation(jobId: string, properties: ValsList, property: string): Promise<number[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/sale.order/create', 'POST', properties, () =>
      this.odooLibService.search(properties, '/sale.order/create'),
    ) as unknown as number[];
  }

  async searchSaleOrderWrite(jobId: string, properties: SearchSalesOrderWrite, property: string): Promise<boolean> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/sale.order/write', 'POST', properties, () =>
      this.odooLibService.search(properties, '/sale.order/write'),
    ) as unknown as boolean;
  }

  async searchContactWrite(jobId: string, properties: ValsList, property: string): Promise<number[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/res.partner/create', 'POST', properties, () =>
      this.odooLibService.search(properties, '/res.partner/create'),
    ) as unknown as number[];
  }

  async searchContactRead(jobId: string, properties: SearchReadParams, property: string): Promise<ContactSearchResponse[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/res.partner/search_read', 'POST', properties, () =>
      this.odooLibService.search(properties, '/res.partner/search_read'),
    ) as unknown as ContactSearchResponse[];
  }

  async searchCompanyRead(jobId: string, properties: SearchReadParams, property: string): Promise<CompanySearchResponse[]> {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, property, '/res.company/search_read', 'POST', properties, () =>
      this.odooLibService.search(properties, '/res.company/search_read'),
    ) as unknown as CompanySearchResponse[];
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
