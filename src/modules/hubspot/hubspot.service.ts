import { Injectable, Logger } from '@nestjs/common';
import { HubspotService as HubspotLibService } from '@libs/hubspot/hubspot.service';
import { AwsSqsProducerService } from '@libs/aws_sqs/producer.service';
import { ConfigService } from '@nestjs/config';
import { QueueRepository, RequestRepository, ResponseRepository } from '@common/repositories';
import { QueueStatus, QueueType, SourceType, RequestType, RequestStatus, ResponseStatus } from '@common/entities';
import { HubspotObjects } from '@common/enums';
import {
  AssociationSpecAssociationCategoryEnum,
  FilterGroup,
  FilterOperatorEnum,
  PublicObjectSearchRequest,
  SimplePublicObject,
  SimplePublicObjectId,
  SimplePublicObjectInputForCreate,
  SimplePublicObjectWithAssociations,
} from '@hubspot/api-client/lib/codegen/crm/objects';
import { HUBSPOT_OBJECT_PROPERTIES } from '@libs/hubspot/constants/properties';
import { PaymentCreatedEvent, ProductCreateEvent, ProductUpdateEvent } from '@modules/odoo/interfaces/event.interfaces';
import { delay } from '@common/utils';
import { ConvertQuotationResponse } from '@libs/odoo/interfaces';
import { HubspotWebhookDto, ProductDto } from './dto';
import { PublicOwner } from '@hubspot/api-client/lib/codegen/crm/owners/models/all';
import { Product } from '@modules/odoo/interfaces';
import { CreateQuoteDto } from './dto/quotation-flow.dto';

@Injectable()
export class HubspotService {
  private readonly logger = new Logger(HubspotService.name);

  constructor(
    private readonly sqsProducerService: AwsSqsProducerService,
    private readonly configService: ConfigService,
    private readonly queueRepository: QueueRepository,
    private readonly requestRepository: RequestRepository,
    private readonly responseRepository: ResponseRepository,
    private readonly hubspotLibService: HubspotLibService,
  ) {}

  async sendSQS(data: HubspotWebhookDto, event?: string) {
    const method = this.sendSQS.name;
    const sqsUrl = this.configService.get<string>('AWS_Q1_QUEUE_URL') ?? '';

    if (!sqsUrl) {
      this.logger.error(`[${method}] Missing SQS URL`);
      throw new Error('SQS configuration error');
    }

    try {
      const queueRec = await this.queueRepository.saveQueueItem(
        this.queueRepository.create({
          payload: data,
          externalId: String(data.objectId),
          queueType: QueueType.WEBHOOK,
          sourceType: SourceType.HUBSPOT,
          status: QueueStatus.QUEUED,
          event: event ?? 'deal_update',
        }),
      );
      await this.sqsProducerService.sendMessage(sqsUrl, queueRec?.jobId, data, 'deal_update');

      this.logger.log(`[${method}] Queued`, {
        jobId: queueRec?.jobId,
        dealId: data.objectId.toString(),
      });

      return { success: true, jobId: queueRec?.jobId };
    } catch (error) {
      this.logger.error(`[${method}] Failed`, {
        error: error?.['message'],
      });
      return { success: false, error: error?.['message'] };
    }
  }

  async getDealDetails(dealId: string, jobId: string) {
    const method = this.getDealDetails.name;

    this.logger.log(`[${method}] Fetching`, { jobId, dealId });

    try {
      const deal = await this.fetchDeal(dealId, jobId);
      const associations = await this.fetchDealsAssociations(dealId, jobId);

      const objects = await this.fetchdDealAssociatedObjects(associations.lineItemIds, associations.contactIds, associations.quoteIds, dealId, jobId);

      this.logger.log(`[${method}] Success`, { jobId });

      return { deal, ...objects };
    } catch (error) {
      this.logger.error(`[${method}] Failed`, {
        jobId,
        error: error?.['message'],
      });
      throw error;
    }
  }

  public async fetchDeal(dealId: string, jobId: string) {
    return this.executeTrackedRequest(jobId, RequestType.FETCH_DEAL, dealId, `/deals/${dealId}`, 'GET', {}, () =>
      this.hubspotLibService.getHubspotObjectData(HubspotObjects.DEALS, dealId, HUBSPOT_OBJECT_PROPERTIES[HubspotObjects.DEALS]),
    );
  }

  public async fetchQuote(jobId: string, quoteId: string) {
    return this.executeTrackedRequest(jobId, RequestType.FETCH_QUOTE, quoteId, `/quotes/${quoteId}`, 'GET', {}, () =>
      this.hubspotLibService.getHubspotObjectData(HubspotObjects.QUOTES, quoteId, HUBSPOT_OBJECT_PROPERTIES[HubspotObjects.QUOTES]),
    );
  }

  public async fetchOwnerById(jobId: string, id: string) {
    return this.executeTrackedRequest(jobId, RequestType.FETCH_OWNER, id, `/owners/${id}`, 'GET', {}, () => this.hubspotLibService.getHubspotOwnerById(id));
  }

  public async fetchInvoiceById(jobId: string, InvoiceId: string) {
    return this.executeTrackedRequest(jobId, RequestType.FETCH_INVOICE, InvoiceId, `/invoices/${InvoiceId}`, 'GET', {}, () =>
      this.hubspotLibService.getHubspotObjectData(HubspotObjects.INVOICES, InvoiceId, HUBSPOT_OBJECT_PROPERTIES[HubspotObjects.INVOICES]),
    );
  }

  private async fetchDealsAssociations(
    dealId: string,
    jobId: string,
    objectTypes: string[] = [HubspotObjects.LINE_ITEMS, HubspotObjects.CONTACTS],
  ): Promise<{
    lineItemIds: SimplePublicObjectId[];
    contactIds: SimplePublicObjectId[];
    quoteIds: SimplePublicObjectId[];
    [key: string]: SimplePublicObjectId[];
  }> {
    const getRequestType = (objectType: string): RequestType => {
      switch (objectType) {
        case HubspotObjects.LINE_ITEMS:
          return RequestType.FETCH_LINEITEM;
        case HubspotObjects.CONTACTS:
          return RequestType.FETCH_CONTACT;
        case HubspotObjects.QUOTES:
          return RequestType.FETCH_QUOTE;
        default:
          return RequestType.SEARCH; // or some default
      }
    };

    const promises = objectTypes.map((objectType) =>
      this.executeTrackedRequest(
        jobId,
        getRequestType(objectType), // Use mapped enum value
        dealId,
        `/${objectType.toLowerCase()}`,
        'GET',
        {},
        () => this.hubspotLibService.getHubspotAssociations(HubspotObjects.DEALS, dealId, objectType as HubspotObjects),
      ),
    );

    const results = await Promise.all(promises);

    const associations = objectTypes.reduce(
      (acc, type, index) => {
        let key: string;

        switch (type) {
          case HubspotObjects.LINE_ITEMS:
            key = 'lineItemIds';
            break;
          case HubspotObjects.CONTACTS:
            key = 'contactIds';
            break;
          case HubspotObjects.QUOTES:
            key = 'quoteIds';
            break;
          default:
            key = `${type.toLowerCase()}Ids`;
        }

        acc[key] = results[index]?.map((i) => ({ id: i.toObjectId })) || [];
        return acc;
      },
      {} as {
        lineItemIds: SimplePublicObjectId[];
        contactIds: SimplePublicObjectId[];
        quoteIds: SimplePublicObjectId[];
        [key: string]: SimplePublicObjectId[];
      },
    );

    return associations;
  }

  private async fetchdDealAssociatedObjects(
    lineItemIds: SimplePublicObjectId[] = [],
    contactIds: SimplePublicObjectId[] = [],
    quoteIds: SimplePublicObjectId[] = [],
    dealId: string,
    jobId: string,
  ): Promise<{
    lineItems: SimplePublicObject[];
    contacts: SimplePublicObject[];
    quotes: SimplePublicObject[];
  }> {
    const [lineItems, contacts, quotes] = await Promise.all([
      lineItemIds.length ? this.fetchBatch(HubspotObjects.LINE_ITEMS, lineItemIds, RequestType.FETCH_LINEITEM, dealId, jobId) : Promise.resolve([]),
      contactIds.length ? this.fetchBatch(HubspotObjects.CONTACTS, contactIds, RequestType.FETCH_CONTACT, dealId, jobId) : Promise.resolve([]),
      quoteIds.length ? this.fetchBatch(HubspotObjects.QUOTES, quoteIds, RequestType.FETCH_QUOTE, dealId, jobId) : Promise.resolve([]),
    ]);

    return { lineItems, contacts, quotes };
  }

  private async fetchBatch(objectType: HubspotObjects, ids: SimplePublicObjectId[], requestType: RequestType, externalId: string, jobId: string): Promise<SimplePublicObject[]> {
    if (!ids.length) return [];

    const result = await this.executeTrackedRequest(jobId, requestType, externalId, `/batch`, 'POST', { inputs: ids }, () =>
      this.hubspotLibService.getBatchObject(objectType, {
        inputs: ids,
        properties: HUBSPOT_OBJECT_PROPERTIES[objectType] ?? [],
        propertiesWithHistory: [],
      }),
    );

    return result?.results ?? [];
  }

  public async updateQuoteById(jobId: string, quoteId: string, properties: Record<string, any>) {
    return this.executeTrackedRequest(jobId, RequestType.UPDATE_QUOTE, quoteId, `/quotes/${quoteId}`, 'PUT', properties, () =>
      this.hubspotLibService.updateHubspotObject(HubspotObjects.QUOTES, quoteId, properties),
    );
  }

  public async createQuote(jobId: string, properties: SimplePublicObjectInputForCreate) {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_QUOTE, null, `/quotes`, 'POST', properties, () =>
      this.hubspotLibService.createHubspotObject(HubspotObjects.QUOTES, properties),
    );
  }

  public async createLineItems(jobId: string, properties: SimplePublicObjectInputForCreate) {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_LINEITEM, null, `/line_items`, 'POST', properties, () =>
      this.hubspotLibService.createHubspotObject(HubspotObjects.LINE_ITEMS, properties),
    );
  }

  public async createProduct(jobId: string, properties: Record<string, any>) {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_PRODUCT, null, `/products`, 'POST', properties, () =>
      this.hubspotLibService.createHubspotObject(HubspotObjects.PRODUCTS, { properties }),
    );
  }

  public async createInVoice(jobId: string, properties: SimplePublicObjectInputForCreate) {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_INVOICE, null, `/invoices`, 'POST', properties, () =>
      this.hubspotLibService.createHubspotObject(HubspotObjects.INVOICES, properties),
    );
  }

  private buildCreateInvoicePayload(
    quotationId: string,
    invoiceId: string,
    dealId: string,
    lineItems: SimplePublicObject[],
    contacts: SimplePublicObject[],
  ): SimplePublicObjectInputForCreate {
    return {
      properties: {
        hs_title: `Invoice from Odoo - ${quotationId}`,
        hs_currency: 'AED', // USD OR AED
        hs_invoice_status: 'draft',
        hs_invoice_date: new Date().toISOString(),
        odoo_quotation_id: quotationId ?? '',
        odoo_invoice_id: invoiceId ?? '',
      },
      associations: [
        ...(dealId ? [{ to: { id: dealId }, types: [{ associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined, associationTypeId: 175 }] }] : []),
        ...(contacts
          ?.filter((c) => c?.id)
          .map((c) => ({ to: { id: c.id }, types: [{ associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined, associationTypeId: 177 }] })) ?? []),
        ...(lineItems
          ?.filter((i) => i?.id)
          .map((i) => ({ to: { id: i.id }, types: [{ associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined, associationTypeId: 409 }] })) ?? []),
      ],
    };
  }

  public async processInvoice(
    jobId: string,
    quotation: Partial<ConvertQuotationResponse>,
    deal: SimplePublicObjectWithAssociations | SimplePublicObject,
    lineItems: SimplePublicObject[],
    contact: SimplePublicObject[],
  ) {
    const payload = this.buildCreateInvoicePayload(quotation.quotation_id as string, quotation.invoice_id as string, deal.id, lineItems, contact);
    this.logger.debug(`${this.processInvoice.name} payload=${JSON.stringify(payload)}`);
    return await this.createInVoice(jobId, payload);
  }

  public async updateProductById(jobId: string, productId: string, properties: Record<string, any>) {
    return this.executeTrackedRequest(jobId, RequestType.UPDATE_CONTACT, productId, `/products/${productId}`, 'PUT', properties, () =>
      this.hubspotLibService.updateHubspotObject(HubspotObjects.PRODUCTS, productId, properties),
    );
  }

  public async updateContactById(jobId: string, contactId: string, properties: Record<string, any>) {
    return this.executeTrackedRequest(jobId, RequestType.UPDATE_CONTACT, contactId, `/contacts/${contactId}`, 'PUT', properties, () =>
      this.hubspotLibService.updateHubspotObject(HubspotObjects.CONTACTS, contactId, properties),
    );
  }

  public async updateDealById(jobId: string, dealId: string, properties: Record<string, any>) {
    return this.executeTrackedRequest(jobId, RequestType.UPDATE_DEAL, dealId, `/deals/${dealId}`, 'PUT', properties, () =>
      this.hubspotLibService.updateHubspotObject(HubspotObjects.DEALS, dealId, properties),
    );
  }

  public async searchObjectByType(jobId: string, hubspotObject: HubspotObjects, request: PublicObjectSearchRequest, after?: string, limit?: number) {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, jobId, `${hubspotObject}/search`, 'POST', request, () =>
      this.hubspotLibService.searchObject(hubspotObject, request, { after, limit }),
    );
  }

  private buildHubspotSearch(params: {
    query?: string;
    limit?: number;
    after?: string;
    sorts?: Array<string>;
    properties?: Array<string>;
    filterGroups?: Array<FilterGroup>;
  }): PublicObjectSearchRequest {
    const searchRequest = new PublicObjectSearchRequest();

    if (params.query) searchRequest.query = params.query;

    if (params.limit !== undefined) searchRequest.limit = params.limit;

    if (params.after !== undefined) searchRequest.after = params.after;

    if (params.sorts !== undefined) searchRequest.sorts = params.sorts;

    if (params.properties !== undefined) searchRequest.properties = params.properties;

    if (params.filterGroups !== undefined) searchRequest.filterGroups = params.filterGroups;

    return searchRequest;
  }

  public async fetchQuoteByOdooInvoiceId(jobId: string, odooInvoiceId: string): Promise<string | null> {
    const searchRequest = this.buildHubspotSearch({
      properties: HUBSPOT_OBJECT_PROPERTIES.quotes ?? [],
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'odoo_invoice_id', // custom Properies
              operator: FilterOperatorEnum.Eq,
              value: odooInvoiceId,
            },
          ],
        },
      ],
      limit: 1,
    });

    await delay(1000); // delay setup
    const searchResult = await this.searchObjectByType(jobId, HubspotObjects.QUOTES, searchRequest, undefined, 1);

    return searchResult?.results[0]?.id ?? null;
  }

  public async fetchQuoteByOdooQuoteId(jobId: string, odooQuoteId: string): Promise<string | null> {
    const searchRequest = this.buildHubspotSearch({
      properties: HUBSPOT_OBJECT_PROPERTIES.quotes ?? [],
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'odoo_quotation_id', // custom Properies
              operator: FilterOperatorEnum.Eq,
              value: odooQuoteId,
            },
          ],
        },
      ],
      limit: 1,
    });

    await delay(1000);
    const searchResult = await this.searchObjectByType(jobId, HubspotObjects.QUOTES, searchRequest, undefined, 1);

    return searchResult?.results[0]?.id ?? null;
  }

  public async fetchProductByOdooProductId(jobId: string, odooProductId: string): Promise<string | null> {
    const searchRequest = this.buildHubspotSearch({
      properties: HUBSPOT_OBJECT_PROPERTIES.products ?? [],
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'odoo_product_id',
              operator: FilterOperatorEnum.Eq,
              value: odooProductId,
            },
          ],
        },
      ],
      limit: 1,
    });
    await delay(1000); // delay setup
    const searchResult = await this.searchObjectByType(jobId, HubspotObjects.PRODUCTS, searchRequest, undefined, 1);

    return searchResult?.results[0]?.id ?? null;
  }

  public async fetchInVoiceByOdooInVoiceId(jobId: string, invoiceId: string): Promise<string | null> {
    const searchRequest = this.buildHubspotSearch({
      properties: HUBSPOT_OBJECT_PROPERTIES.invoices ?? [],
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'odoo_invoice_id',
              operator: FilterOperatorEnum.Eq,
              value: invoiceId,
            },
          ],
        },
      ],
      limit: 1,
    });

    await delay(1000); // delay setup
    const searchResult = await this.searchObjectByType(jobId, HubspotObjects.INVOICES, searchRequest, undefined, 1);

    return searchResult?.results[0]?.id ?? null;
  }

  private buildProductsPayload(properties: ProductCreateEvent | ProductUpdateEvent) {
    this.logger.debug(`${this.buildProductsPayload.name} data=${JSON.stringify(properties)}`);
    return {
      name: properties.name,
      price: properties?.price,
      hs_sku: properties.product_id,
      odoo_product_id: properties?.product_id, // custom Properties
    };
  }

  public async processProducts(jobId: string, properties: ProductCreateEvent | ProductUpdateEvent, odooEvent?: string) {
    const productProperties = this.buildProductsPayload(properties);

    const normalizedEvent = odooEvent?.toLowerCase() || '';
    const isCreateEvent = normalizedEvent.includes('product_create') || normalizedEvent.includes('product_created');
    const isUpdateEvent = normalizedEvent.includes('product_update') || normalizedEvent.includes('product_updated');

    if (!properties?.product_id) {
      await this.queueRepository.updateStatus(jobId, QueueStatus.SKIPPED, 'product_id is required for product sync');
      this.logger.debug(`Product Id Not Found So skipped`);
      return;
    }
    try {
      const hubSpotProductId = await this.fetchProductByOdooProductId(jobId, properties.product_id);

      if (isCreateEvent) {
        if (hubSpotProductId) {
          this.logger.debug(`Product already exists in HubSpot (ID: ${hubSpotProductId}), updating instead of creating`);
          return await this.updateProductById(jobId, hubSpotProductId, productProperties);
        }

        return await this.createProduct(jobId, productProperties);
      }

      if (isUpdateEvent) {
        if (!hubSpotProductId) {
          this.logger.debug(`Product not found in HubSpot, creating new product`);
          return await this.createProduct(jobId, productProperties);
        }

        return await this.updateProductById(jobId, hubSpotProductId, productProperties);
      }

      if (!hubSpotProductId) {
        this.logger.debug(`Fallback: Product not found, creating`);
        return await this.createProduct(jobId, productProperties);
      }

      this.logger.debug(`Fallback: Product found (ID: ${hubSpotProductId}), updating`);

      return await this.updateProductById(jobId, hubSpotProductId, productProperties);
    } catch (error) {
      this.logger.error(`Error processing product ${properties.product_id}`, 'error'?.['stack']);
      await this.queueRepository.updateStatus(jobId, QueueStatus.FAILED, error?.['message']);
    }
  }

  public async fetchAssociatedDealIdByQuoteId(quoteId: string, jobId: string): Promise<string | null> {
    const deals = await this.executeTrackedRequest(jobId, RequestType.FETCH_DEAL, quoteId, `/quotes/${quoteId}/associations/deals`, 'GET', {}, () =>
      this.hubspotLibService.getHubspotAssociations(HubspotObjects.QUOTES, quoteId, HubspotObjects.DEALS),
    );

    if (!deals?.length) {
      this.logger.warn(`${this.fetchAssociatedDealIdByQuoteId.name} No deals found`, { quoteId, jobId });
      return null;
    }
    return deals[0]?.toObjectId;
  }

  public async fetchAssociatedQuoteByDealId(dealId: string, jobId: string): Promise<string | null> {
    const quotes = await this.executeTrackedRequest(jobId, RequestType.FETCH_QUOTE, dealId, `/deals/${dealId}/associations/quotes`, 'GET', {}, () =>
      this.hubspotLibService.getHubspotAssociations(HubspotObjects.DEALS, dealId, HubspotObjects.QUOTES),
    );

    if (!quotes?.length) {
      this.logger.warn(`${this.fetchAssociatedQuoteByDealId.name} No associated quotes found`, { dealId, jobId });

      return null;
    }

    return quotes[0]?.toObjectId ?? null;
  }
  public async fetchAssociatedDealIdByInVoiceId(invoiceId: string, jobId: string): Promise<string | null> {
    const deals = await this.executeTrackedRequest(jobId, RequestType.FETCH_DEAL, invoiceId, `/invoices/${invoiceId}/associations/deals`, 'GET', {}, () =>
      this.hubspotLibService.getHubspotAssociations(HubspotObjects.INVOICES, invoiceId, HubspotObjects.DEALS),
    );

    if (!deals?.length) {
      this.logger.warn(`${this.fetchAssociatedDealIdByInVoiceId.name} No deals found`, { invoiceId, jobId });
      return null;
    }
    return deals[0]?.toObjectId;
  }

  public async fetchQuoteTemplates(jobId: string) {
    return this.executeTrackedRequest(jobId, RequestType.FETCH_QUOTE_TEMPLATE, null, `/quote_template`, 'GET', {}, () =>
      this.hubspotLibService.getHubspotObjectList(HubspotObjects.QUOTE_TEMPLATE, HUBSPOT_OBJECT_PROPERTIES[HubspotObjects.QUOTE_TEMPLATE]),
    );
  }

  private buildQuotePayload(properties: Record<string, any>, owner?: PublicOwner) {
    this.logger.debug(`${this.buildQuotePayload.name} Properties=${JSON.stringify(properties)} and Owner : ${JSON.stringify(owner)}`);
    const date = new Date();
    date.setDate(date.getDate() + 30);

    const expiredDate = date.toISOString().split('T')[0];

    return {
      hs_title: properties?.hs_title ?? properties?.dealname,
      hs_status: 'DRAFT',
      hs_language: 'en',
      hs_currency: properties?.hs_currency ?? 'AED', // USD Or AED
      hs_expiration_date: properties?.hs_expiration_date ?? expiredDate,
      odoo_quotation_id: properties?.quotationId ?? '',

      // hs_total_amount: properties?.amount || 0,
      ...(owner && {
        hs_sender_firstname: owner?.firstName,
        hs_sender_lastname: owner?.lastName,
        hs_sender_email: owner?.email,
      }),
    };
  }

  public async quoteProcess(
    jobId: string,
    dealId: string,
    properties: Record<string, any>,
    quotationId?: string,
    lineItems: SimplePublicObject[] = [],
    owner?: PublicOwner,
    quoteTemplateId?: string,
  ) {
    const payload: SimplePublicObjectInputForCreate = {
      properties: this.buildQuotePayload({ quotationId, ...properties }, owner),
      associations: [
        {
          to: { id: dealId },
          types: [{ associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined, associationTypeId: 64 }],
        },
        ...lineItems.map(({ id }) => ({
          to: { id },
          types: [{ associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined, associationTypeId: 67 }],
        })),
        ...(quoteTemplateId
          ? [
              {
                to: { id: quoteTemplateId },
                types: [{ associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined, associationTypeId: 286 }],
              },
            ]
          : []),
      ],
    };

    return this.createQuote(jobId, payload);
  }

  public async processCreateLinetems(jobId: string, dealId: string, payment: PaymentCreatedEvent | Product) {
    const properties: SimplePublicObjectInputForCreate = {
      properties: {
        name: `${payment.transaction_id} - ${payment.invoice_id}`,
        quantity: '1',
        price: payment.amount_paid?.toString(),
        odooodoo_product_id: payment?.['id'],
      },
      associations: [{ to: { id: dealId }, types: [{ associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined, associationTypeId: 20 }] }],
    };
    return await this.createLineItems(jobId, properties);
  }

  public async syncOdooProductsToHubSpotLineItems(products: ProductDto[], dealId: string) {
    const results = await Promise.all(
      products.map(async (product) => {
        const properties: SimplePublicObjectInputForCreate = {
          properties: {
            name: `${product.name} - ${product.id}`,
            quantity: String(product.quantity ?? 1),
            price: product.price?.toString() || '0',
            odoo_product_id: product.id.toString(),
          },
          associations: [
            {
              to: { id: dealId },
              types: [
                {
                  associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined,
                  associationTypeId: 20,
                },
              ],
            },
          ],
        };

        try {
          const response = await this.hubspotLibService.createHubspotObject(HubspotObjects.LINE_ITEMS, properties);

          return { success: true, data: response };
        } catch (error: any) {
          return {
            success: false,
            message: error?.message,
            productId: product.id,
          };
        }
      }),
    );

    return {
      success: true,
      total: products.length,
      results,
    };
  }

  private buildAssociation(toId: string, typeId: number) {
    return {
      to: { id: toId },
      types: [
        {
          associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined,
          associationTypeId: typeId,
        },
      ],
    };
  }

  private buildQuotePayloadObject(
    dealId: string,
    lineItems: SimplePublicObject[],
    properties: Record<string, any>,
    owner?: PublicOwner,
    quotationId?: string,
    quoteTemplateId?: string,
  ): SimplePublicObjectInputForCreate {
    return {
      properties: this.buildQuotePayload({ quotationId, ...properties }, owner),

      associations: [
        this.buildAssociation(dealId, 64),

        ...lineItems.map(({ id }) => this.buildAssociation(id, 67)),

        ...(quoteTemplateId ? [this.buildAssociation(quoteTemplateId, 286)] : []),
      ],
    };
  }

  public async createQuoteDirect(dealObject: CreateQuoteDto, dealId: string) {
    try {
      const deal = await this.hubspotLibService.getHubspotObjectData(HubspotObjects.DEALS, dealId, HUBSPOT_OBJECT_PROPERTIES[HubspotObjects.DEALS]).catch(() => null);

      if (!deal) {
        return {
          success: false,
          message: 'Deal not found',
        };
      }

      const owner = await this.hubspotLibService.getHubspotOwnerById(dealObject.dealOwnerId).catch(() => null);

      const quoteTemplates = await this.hubspotLibService
        .getHubspotObjectList(HubspotObjects.QUOTE_TEMPLATE, HUBSPOT_OBJECT_PROPERTIES[HubspotObjects.QUOTE_TEMPLATE])
        .catch(() => ({ results: [] }));

      const template = quoteTemplates.results?.find(
        (v) => v?.['properties']?.['hs_type'] === 'customizable_quote_template' && v?.['properties']?.['hs_name'] === 'Default Original',
      );

      const lineItemsResponse = await this.hubspotLibService
        .getBatchObject(HubspotObjects.LINE_ITEMS, {
          inputs: dealObject.lineItemIds.map((id) => ({
            id: String(id),
          })),
          properties: HUBSPOT_OBJECT_PROPERTIES[HubspotObjects.LINE_ITEMS] ?? [],
          propertiesWithHistory: [],
        })
        .catch(() => null);

      const lineItems = lineItemsResponse?.results ?? [];

      if (!lineItems.length) {
        return {
          success: false,
          message: 'No line items found',
        };
      }

      // const payload = await this.buildQuotePayloadObject(deal.id, lineItems, deal.properties, owner as PublicOwner, undefined, template?.id);

      // const response = await this.hubspotLibService.createHubspotObject(HubspotObjects.QUOTES, payload);

      return lineItemsResponse;
    } catch (error: any) {
      return {
        success: false,
        statusCode: 500,
        message: error?.message || 'Quote creation failed',
      };
    }
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

    this.logger.log(`[API:${requestType}] Request`, {
      jobId,
      endpoint,
    });

    const request = await this.requestRepository.saveRequest(
      await this.requestRepository.create({
        jobId,
        requestType,
        externalId,
        targetSystem: SourceType.HUBSPOT,
        endpoint,
        method,
        payload,
        status: RequestStatus.PROCESSING,
      }),
    );

    try {
      const result = await handler();

      await this.responseRepository.saveResponse(
        await this.responseRepository.create({
          requestId: request.id,
          jobId,
          statusCode: 200,
          status: ResponseStatus.SUCCESS,
          data: result,
          durationMs: Date.now() - start,
        }),
      );

      await this.requestRepository.updateStatus(request.id, RequestStatus.SUCCESS);

      this.logger.log(`[API:${requestType}] Success`, {
        jobId,
        duration: Date.now() - start,
      });

      return result;
    } catch (error: any) {
      await this.responseRepository.saveResponse(
        await this.responseRepository.create({
          requestId: request.id,
          jobId,
          statusCode: error?.['status'] || 500,
          status: ResponseStatus.ERROR,
          error,
          durationMs: Date.now() - start,
        }),
      );

      await this.requestRepository.updateStatus(request.id, RequestStatus.FAILED, JSON.stringify(error));

      await this.requestRepository.incrementRetryCount(request.id);

      this.logger.error(`[API:${requestType}] Failed`, {
        jobId,
        error: error?.['message'],
      });

      throw error;
    }
  }
}
