import { Injectable, Logger } from '@nestjs/common';
import { HubspotService as HubspotLibService } from '@libs/hubspot/hubspot.service';
import { AwsSqsProducerService } from '@libs/aws_sqs/producer.service';
import { QuotationFlow } from './dto/quotation-flow.dto';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { QueueRepository, RequestRepository, ResponseRepository } from '@common/repositories';
import { QueueStatus, QueueType, Flow, SourceType, RequestType, RequestStatus, ResponseStatus } from '@common/entities';
import { HubspotObjects } from '@common/enums';
import { FilterGroup, FilterOperatorEnum, PublicObjectSearchRequest, SimplePublicObject, SimplePublicObjectId } from '@hubspot/api-client/lib/codegen/crm/objects';
import { HUBSPOT_OBJECT_PROPERTIES } from '@libs/hubspot/constants/properties';
import { ProductCreateEvent, ProductUpdateEvent } from '@modules/odoo/interfaces/event.interfaces';
import { delay } from '@common/utils';

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

  async sendQuotationFlow(data: QuotationFlow) {
    const method = this.sendQuotationFlow.name;
    const jobId = uuidv4();
    const sqsUrl = this.configService.get<string>('AWS_Q1_QUEUE_URL') ?? '';

    if (!sqsUrl) {
      this.logger.error(`[${method}] Missing SQS URL`);
      throw new Error('SQS configuration error');
    }

    try {
      await this.sqsProducerService.sendMessage(sqsUrl, jobId, data);

      await this.queueRepository.saveQueueItem(
        this.queueRepository.create({
          jobId,
          payload: data,
          externalId: String(data.dealId),
          queueType: QueueType.SYNC_JOB,
          sourceType: SourceType.HUBSPOT,
          status: QueueStatus.QUEUED,
          flow: data.quotationFlow as unknown as Flow,
        }),
      );

      this.logger.log(`[${method}] Queued`, {
        jobId,
        dealId: data.dealId,
        quoteId: data.quoteId,
      });

      return { success: true, jobId };
    } catch (error) {
      this.logger.error(`[${method}] Failed`, {
        jobId,
        error: error?.['message'],
      });

      return { success: false, error: error?.['message'], jobId };
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

  private async fetchDeal(dealId: string, jobId: string) {
    return this.executeTrackedRequest(jobId, RequestType.FETCH_DEAL, dealId, `/deals/${dealId}`, 'GET', {}, () =>
      this.hubspotLibService.getHubspotObjectData(HubspotObjects.DEALS, dealId, []),
    );
  }

  private async fetchDealsAssociations(dealId: string, jobId: string) {
    const [lineItems, contacts, quotes] = await Promise.all([
      this.executeTrackedRequest(jobId, RequestType.FETCH_LINEITEM, dealId, `/line_items`, 'GET', {}, () =>
        this.hubspotLibService.getHubspotAssociations(HubspotObjects.DEALS, dealId, HubspotObjects.LINE_ITEMS),
      ),
      this.executeTrackedRequest(jobId, RequestType.FETCH_CONTACT, dealId, `/contacts`, 'GET', {}, () =>
        this.hubspotLibService.getHubspotAssociations(HubspotObjects.DEALS, dealId, HubspotObjects.CONTACTS),
      ),
      this.executeTrackedRequest(jobId, RequestType.FETCH_QUOTE, dealId, `/quotes`, 'GET', {}, () =>
        this.hubspotLibService.getHubspotAssociations(HubspotObjects.DEALS, dealId, HubspotObjects.QUOTES),
      ),
    ]);

    return {
      lineItemIds: lineItems?.map((i) => ({ id: i.toObjectId })) || [],
      contactIds: contacts?.map((i) => ({ id: i.toObjectId })) || [],
      quoteIds: quotes?.map((i) => ({ id: i.toObjectId })) || [],
    };
  }

  private async fetchdDealAssociatedObjects(
    lineItemIds: SimplePublicObjectId[],
    contactIds: SimplePublicObjectId[],
    quoteIds: SimplePublicObjectId[],
    dealId: string,
    jobId: string,
  ): Promise<{
    lineItems: SimplePublicObject[];
    contacts: SimplePublicObject[];
    quotes: SimplePublicObject[];
  }> {
    const [lineItems, contacts, quotes] = await Promise.all([
      this.fetchBatch(HubspotObjects.LINE_ITEMS, lineItemIds, RequestType.FETCH_LINEITEM, dealId, jobId),
      this.fetchBatch(HubspotObjects.CONTACTS, contactIds, RequestType.FETCH_CONTACT, dealId, jobId),
      this.fetchBatch(HubspotObjects.QUOTES, quoteIds, RequestType.FETCH_QUOTE, dealId, jobId),
    ]);

    return { lineItems, contacts, quotes };
  }

  private async fetchBatch(objectType: HubspotObjects, ids: SimplePublicObjectId[], requestType: RequestType, externalId: string, jobId: string): Promise<SimplePublicObject[]> {
    if (!ids.length) return [];

    const result = await this.executeTrackedRequest(jobId, requestType, externalId, `/batch`, 'POST', { inputs: ids }, () =>
      this.hubspotLibService.getBatchObject(objectType, {
        inputs: ids,
        properties: [],
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

  public async createProduct(jobId: string, properties: Record<string, any>) {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_PRODUCT, null, `/products`, 'POST', properties, () =>
      this.hubspotLibService.createHubspotObject(HubspotObjects.PRODUCTS, { properties }),
    );
  }

  public async updateProductById(jobId: string, productId: string, properties: Record<string, any>) {
    return this.executeTrackedRequest(jobId, RequestType.UPDATE_CONTACT, productId, `/products/${productId}`, 'PUT', properties, () =>
      this.hubspotLibService.updateHubspotObject(HubspotObjects.PRODUCTS, productId, properties),
    );
  }

  public async searchObjectByType(jobId: string, hubspotObject: HubspotObjects, request: PublicObjectSearchRequest, after?: string, limit?: number) {
    return this.executeTrackedRequest(jobId, RequestType.SEARCH, jobId, `/search`, 'POST', request, () => this.hubspotLibService.searchObject(hubspotObject, { after, limit }));
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

    if (params.query !== undefined) {
      searchRequest.query = params.query;
    }

    if (params.limit !== undefined) {
      searchRequest.limit = params.limit;
    }

    if (params.after !== undefined) {
      searchRequest.after = params.after;
    }

    if (params.sorts !== undefined) {
      searchRequest.sorts = params.sorts;
    }

    if (params.properties !== undefined) {
      searchRequest.properties = params.properties;
    }

    if (params.filterGroups !== undefined) {
      searchRequest.filterGroups = params.filterGroups;
    }

    return searchRequest;
  }

  public async fetchQuoteByOdooInvoiceId(jobId: string, odooInvoiceId: string): Promise<string | null> {
    const searchRequest = this.buildHubspotSearch({
      properties: HUBSPOT_OBJECT_PROPERTIES.quotes ?? [],
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'odoo_invoice_id',
              operator: FilterOperatorEnum.Eq,
              value: odooInvoiceId,
            },
          ],
        },
      ],
      limit: 1,
    });

    await delay(5000); // delay setup
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
              propertyName: 'hs_sku',
              operator: FilterOperatorEnum.Eq,
              value: odooProductId,
            },
          ],
        },
      ],
      limit: 1,
    });
    await delay(5000); // delay setup
    const searchResult = await this.searchObjectByType(jobId, HubspotObjects.PRODUCTS, searchRequest, undefined, 1);

    return searchResult?.results[0]?.id ?? null;
  }

  private buildProductsPayload(properties: ProductCreateEvent | ProductUpdateEvent) {
    this.logger.debug(`${this.buildProductsPayload.name} data=${JSON.stringify(properties)}`);
    return {
      name: properties.name,
      price: properties?.price,
      hs_sku: properties.product_id,
      odoo_product_id: properties?.product_id,
    };
  }

  public async processProducts(jobId: string, properties: ProductCreateEvent | ProductUpdateEvent, odooEvent?: string) {
    const productProperties = this.buildProductsPayload(properties);

    const normalizedEvent = odooEvent?.toLowerCase() || '';

    const isCreateEvent = normalizedEvent.includes('product_create') || normalizedEvent.includes('product_created');

    const isUpdateEvent = normalizedEvent.includes('product_update') || normalizedEvent.includes('product_updated');

    if (!properties?.product_id) {
      throw new Error('product_id is required for product sync');
    }

    if (isCreateEvent) {
      return await this.createProduct(jobId, productProperties);
    }

    if (isUpdateEvent) {
      return await this.updateProductById(jobId, properties.product_id, productProperties);
    }

    const hubSpotProductId = await this.fetchProductByOdooProductId(jobId, properties.product_id);

    if (!hubSpotProductId) {
      return await this.createProduct(jobId, productProperties);
    }

    return await this.updateProductById(jobId, properties.product_id, productProperties);
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
    } catch (error) {
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
