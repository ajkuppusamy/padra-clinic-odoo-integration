import { Injectable, Logger } from '@nestjs/common';
import { OdooService as OdooLibService } from '@libs/odoo/odoo.service';
import { QueueRepository, RequestRepository, ResponseRepository } from '@common/repositories';
import {
  CreateContactRequest,
  CreateContactResponse,
  CreateProductRequest,
  CreateQuotationRequest,
  ISO8601Date,
  UpdateContactRequest,
  UpdateProductRequest,
} from '@libs/odoo/interfaces';
import { RequestType, RequestStatus, ResponseStatus, SourceType, QueueStatus, QueueType } from '@common/entities';
import { OdooWebhookEvent } from './enums/webhook-event-enum';
import { AwsSqsProducerService } from '@libs/aws_sqs/producer.service';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { HubspotService } from '@modules/hubspot/hubspot.service';

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

  async handlingWebhook(eventName: string | OdooWebhookEvent, body: Record<string, any>) {
    const method = this.handlingWebhook;
    const jobId = uuidv4();
    const sqsUrl = this.configService.get<string>('AWS_Q1_QUEUE_URL') ?? '';

    if (!sqsUrl) {
      this.logger.error(`[${method}] Missing SQS URL`);
      throw new Error('SQS configuration error');
    }

    const payload = {
      ...body,
      eventType: eventName,
    };

    try {
      await this.sqsProducerService.sendMessage(sqsUrl, jobId, payload);

      await this.queueRepository.saveQueueItem(
        this.queueRepository.create({
          jobId,
          payload,
          externalId: String(body?.id),
          queueType: QueueType.WEBHOOK,
          sourceType: SourceType.ODOO,
          status: QueueStatus.QUEUED,
        }),
      );

      this.logger.log(`[${method}] Queued`, {
        jobId,
        eventType: eventName,
      });

      return { success: true, jobId };
    } catch (error) {
      this.logger.error(`[${method}] Failed`, {
        jobId,
        eventType: eventName,
        error: error?.['message'],
      });

      return { success: false, error: error?.['message'], jobId };
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

  async checkExistContact(email: string): Promise<boolean> {
    return !!email; // replace with actual lookup
  }

  async contactProcess(properties: Record<string, any>, jobId: string): Promise<string> {
    const generateRandomGmail = (prefix = 'user'): string => {
      const random = Math.random().toString(36).substring(2, 6);
      const timestamp = Date.now().toString().slice(-6);
      return `${prefix}${timestamp}${random}@gmail.com`;
    };

    const payload = this.buildContactProperties(properties);

    payload.email = generateRandomGmail();
    // const exists = await this.checkExistContact(email);
    // const contactId = '1122'; // replace with real lookup

    // if (exists && contactId) {
    //   await this.updateContact(jobId, contactId, payload);
    //   return contactId;
    // }

    const odooContactId = (await this.createContact(jobId, payload))?.contact_id;
    const hubspotContactId = properties?.hs_object_id;
    await this.hubService.updateContactById(jobId, hubspotContactId, { odoo_contact_id: odooContactId }); // custom Property
    return odooContactId;
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
    } catch (error) {
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
