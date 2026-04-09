import { Injectable, Logger } from '@nestjs/common';
import { OdooService as OdooLibService } from '@libs/odoo/odoo.service';
import { RequestRepository, ResponseRepository } from '@common/repositories';
import { CreateContactRequest, CreateContactResponse, CreateQuotationRequest, ISO8601Date, UpdateContactRequest } from '@libs/odoo/interfaces';
import { RequestType, RequestStatus, ResponseStatus, SourceType } from '@common/entities';
import { OdooWebhookEvent } from './enums/webhook-event-enum';

@Injectable()
export class OdooService {
  private readonly logger = new Logger(OdooService.name);

  constructor(
    private readonly odooLibService: OdooLibService,
    private readonly requestRespository: RequestRepository,
    private readonly responseRespository: ResponseRepository,
  ) {}

  async handlingWebhook(eventName: string | OdooWebhookEvent, body: Record<string, any>) {
    switch (eventName) {
      case OdooWebhookEvent.QUOTATION_STATUS_UPDATE:
        return this.handleQuotation(body);

      case OdooWebhookEvent.PAYMENT_CREATED:
        return this.handlePayment(body);

      case OdooWebhookEvent.INVOICE_CREATED:
        return this.handleInvoice(body);

      default:
        throw new Error(`Unsupported event: ${eventName}`);
    }
  }

  private async handleQuotation(body: Record<string, any>) {
    this.logger.log('Handle quotation event');
    return body;
  }

  private async handlePayment(body: Record<string, any>) {
    this.logger.log('Handle payment event');
    return body;
  }

  private async handleInvoice(body: Record<string, any>) {
    this.logger.log('Handle invoice event');
    return body;
  }

  private buildContactProperties(properties: Record<string, any>): CreateContactRequest {
    this.logger.debug(`${this.buildContactProperties.name} Keys: ${Object.keys(properties)}`);

    return {
      email: properties.email ?? '',
      company_name: properties.company_name ?? '',
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
    const payload = this.buildContactProperties(properties);
    const email = payload.email;

    const exists = await this.checkExistContact(email);
    const contactId = '1122'; // replace with real lookup

    if (exists && contactId) {
      await this.updateContact(jobId, contactId, payload);
      return contactId;
    }

    return (await this.createContact(jobId, payload))?.contact_id;
  }

  async createContact(jobId: string, properties: CreateContactRequest): Promise<CreateContactResponse> {
    return this.executeTrackedRequest(jobId, RequestType.CREATE_CONTACT, properties.email, '/contact', 'POST', properties, () => this.odooLibService.createContact(properties));
  }

  async updateContact(jobId: string, contactId: string, properties: UpdateContactRequest) {
    return this.executeTrackedRequest(jobId, RequestType.UPDATE_CONTACT, contactId, `/contacts/${contactId}`, 'PUT', properties, () =>
      this.odooLibService.updateContact(contactId, properties),
    );
  }

  async buildQuotationProperties(odooContactId: string, lineItemProperties: {}[]): Promise<CreateQuotationRequest> {
    const lineItems = lineItemProperties.map((item: any) => ({
      description: item.description ?? item?.hs_sku,
      quantity: item.quantity || 0,
      unit_price: item.unit_price || 0,
      product_id: item.odoo_product_id ?? item?.hs_sku,
      tax_rate: item.tax_rate,
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
    const properties: CreateQuotationRequest = this.buildQuotationProperties(odooContactId, lineItemProperties) as unknown as CreateQuotationRequest;
    return await this.createQuotation(jobId, properties);
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
