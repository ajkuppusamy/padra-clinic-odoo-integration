import { Injectable, Logger } from '@nestjs/common';
import { HubspotService as HubspotLibService } from '@libs/hubspot/hubspot.service';
import { AwsSqsProducerService } from '@libs/aws_sqs/producer.service';
import { QuotationFlow } from './dto/quotation-flow.dto';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { QueueRepository, RequestRepository, ResponseRepository } from '@common/repositories';
import { QueueStatus, QueueType, Flow, SourceType, RequestType, RequestStatus, ResponseStatus } from '@common/entities';
import { HubspotObjects } from '@common/enums';

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
      const associations = await this.fetchAssociations(dealId, jobId);

      const objects = await this.fetchAssociatedObjects(associations.lineItemIds, associations.contactIds, associations.quoteIds, dealId, jobId);

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

  private async fetchAssociations(dealId: string, jobId: string) {
    const [lineItems, contacts, quotes] = await Promise.all([
      this.executeTrackedRequest(jobId, RequestType.FETCH_LINEITEMS, dealId, `/line_items`, 'GET', {}, () =>
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

  private async fetchAssociatedObjects(lineItemIds, contactIds, quoteIds, dealId, jobId) {
    const [lineItems, contacts, quotes] = await Promise.all([
      this.fetchBatch(HubspotObjects.LINE_ITEMS, lineItemIds, RequestType.FETCH_LINEITEMS, dealId, jobId),
      this.fetchBatch(HubspotObjects.CONTACTS, contactIds, RequestType.FETCH_CONTACT, dealId, jobId),
      this.fetchBatch(HubspotObjects.QUOTES, quoteIds, RequestType.FETCH_QUOTE, dealId, jobId),
    ]);

    return { lineItems, contacts, quotes };
  }

  private async fetchBatch(objectType, ids, requestType, externalId, jobId) {
    if (!ids.length) return [];

    const result = await this.executeTrackedRequest(jobId, requestType, externalId, `/batch`, 'POST', { inputs: ids }, () =>
      this.hubspotLibService.getBatchObject(objectType, {
        inputs: ids,
        properties: [],
        propertiesWithHistory: [],
      }),
    );

    return result?.results || [];
  }

  public async updateQuoteById(jobId: string, quoteId: string, properties: Record<string, any>) {
    return this.executeTrackedRequest(jobId, RequestType.UPDATE_QUOTE, quoteId, `/quotes/${quoteId}`, 'PUT', properties, () =>
      this.hubspotLibService.updateHubspotObject(HubspotObjects.QUOTES, quoteId, properties),
    );
  }

  private async executeTrackedRequest<T>(
    jobId: string,
    requestType: RequestType,
    externalId: string,
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
      this.requestRepository.create({
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
        this.responseRepository.create({
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
        this.responseRepository.create({
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
