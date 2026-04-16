import { QueueStatus } from '@common/entities';
import { QueueRepository } from '@common/repositories';
import { toHubspotDateValue } from '@common/utils';
import { SimplePublicObject, SimplePublicObjectWithAssociations } from '@hubspot/api-client/lib/codegen/crm/companies';
import { CreateQuotationResponse } from '@libs/odoo/interfaces';
import { PaymentMethod } from '@modules/hubspot/dto/quotation-flow.dto';
import { HubspotService } from '@modules/hubspot/hubspot.service';
import { PaymentCreatedEvent, ProductCreateEvent, ProductUpdateEvent } from '@modules/odoo/interfaces/event.interfaces';
import { OdooService } from '@modules/odoo/odoo.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(
    private readonly queueRepository: QueueRepository,
    private readonly hubspotService: HubspotService,
    private readonly odooService: OdooService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * =========================
   * DEAL EXECUTION FLOW
   * =========================
   */
  async dealExecutionProcess(dealId: string, jobId: string) {
    const context = 'dealExecutionProcess';

    this.logger.log(`[${context}] Started`, { jobId, dealId });

    try {
      const dealsMetaData = await this.hubspotService.getDealDetails(dealId, jobId);

      const contacts = dealsMetaData?.contacts ?? [];
      const lineItems = dealsMetaData?.lineItems ?? [];
      const deal = dealsMetaData.deal;

      this.logger.log(`[${context}] Deal data fetched`, {
        jobId,
        contactsCount: contacts.length,
        lineItemsCount: lineItems.length,
      });

      const stageId = this.configService.get<string>('HUBSPOT_QUOTATION_STAGE_ID');
      this.logger.debug(`Deal Stage Id : ${stageId}`);

      if (deal.properties.dealstage !== stageId) return await this.handleSkip(jobId, context, 'Deal Stage not Quotation Process');

      const odooContactId = await this.processContacts(contacts, jobId);

      if (!odooContactId) return await this.handleSkip(jobId, context, 'No associated contact found');

      const offlinePaymentMethod = [PaymentMethod.CASH, PaymentMethod.CREDIT, PaymentMethod.DEBIT];

      const isOffline = offlinePaymentMethod.includes(deal?.properties?.payment_method as unknown as PaymentMethod);

      const lineitemProperties = lineItems.map((i) => i?.properties);
      this.logger.debug(`total Line Items: ${lineItems.length}`);
      if (!lineItems.length) return await this.handleSkip(jobId, context, 'No Associated LinItems');

      const quotation = await this.odooService.processQuotation(jobId, odooContactId, lineitemProperties);

      this.logger.log(`[${context}] Quotation created`, {
        jobId,
        quotationId: quotation?.quotation_id,
      });
      this.logger.verbose(`Payment Method : ${deal?.properties?.payment_method}`);

      const quoteId = await this.hubspotService.quoteProcess(jobId, dealId, deal.properties, quotation.quotation_id, lineItems);

      if (!quoteId) return await this.handleSkip(jobId, context, 'Quote creation failed');

      if (isOffline) {
        await this.handleOfflineFlow(jobId, quoteId.id, quotation);
      } else {
        await this.handleOnlineFlow(jobId, quotation, deal, lineItems, contacts);
      }

      await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);

      this.logger.log(`[${context}] Completed successfully`, { jobId });

      return { success: true };
    } catch (error) {
      this.logger.error(`[${context}] Failed`, {
        jobId,
        error: error?.['message'],
        stack: error?.['stack'],
      });
    }
  }

  /**
   * =========================
   * CONTACT PROCESSING
   * =========================
   */
  private async processContacts(contacts: SimplePublicObject[], jobId: string): Promise<string | null> {
    let odooContactId: string | null = null;

    for (const contact of contacts) {
      try {
        const id = await this.odooService.contactProcess(contact?.properties, jobId);

        this.logger.log(`[processContacts] Contact processed`, {
          jobId,
          hubspotContactId: contact?.id,
          odooContactId: id,
        });

        if (!odooContactId) odooContactId = id;
      } catch (error) {
        this.logger.error(`[processContacts] Contact processing failed`, {
          jobId,
          hubspotContactId: contact?.id,
          error: error?.['message'],
        });
      }
    }

    return odooContactId;
  }

  /**
   * =========================
   * OFFLINE FLOW
   * =========================
   */
  private async handleOfflineFlow(jobId: string, quoteId: string, quotation: CreateQuotationResponse) {
    this.logger.log(`[handleOfflineFlow] Updating HubSpot quote`, {
      jobId,
      quoteId,
      quotationId: quotation?.quotation_id,
    });

    await this.hubspotService.updateQuoteById(jobId, quoteId, {
      odoo_quotation_id: quotation.quotation_id,
    });
  }

  /**
   * =========================
   * ONLINE FLOW
   * =========================
   */
  private async handleOnlineFlow(
    jobId: string,
    quotation: CreateQuotationResponse,
    deal: SimplePublicObjectWithAssociations,
    lineItems: SimplePublicObject[],
    contact: SimplePublicObject[],
  ) {
    this.logger.log(`[handleOnlineFlow] Converting quotation to invoice`, {
      jobId,
      quotationId: quotation?.quotation_id,
    });

    const invoice = await this.odooService.ProcessQuotationtoInvoice(jobId, quotation.quotation_id);

    /** Create hubspot invoice and associate with deal */
    const createInvoice = await this.hubspotService.processInvoice(jobId, invoice, deal, lineItems, contact);

    this.logger.log(`[handleOnlineFlow] Invoice created`, {
      jobId,
      odooInvoiceId: invoice?.invoice_id,
      hubspotInvoiceId: createInvoice.id,
    });

    /** Update quotation invoice id into the hubspot invoice */

    // await this.hubspotService.updateQuoteById(jobId, quoteId, {
    //   odoo_invoice_id: invoice.invoice_id,
    //   odoo_quotation_id: invoice.quotation_id,
    // });

    /** Generate payment link and update in deal */
  }

  /**
   * =========================
   * COMMON SKIP HANDLER
   * =========================
   */
  private async handleSkip(jobId: string, context: string, reason: string): Promise<void> {
    this.logger.warn(`[${context}] Skipped`, { jobId, reason });

    await this.queueRepository.updateStatus(jobId, QueueStatus.SKIPPED);

    // throw new Error(reason);
  }

  /**
   * =========================
   * PRODUCT FLOW
   * =========================
   */
  public async handlingProductProcess(jobId: string, properties: ProductCreateEvent | ProductUpdateEvent, odooEvent?: string) {
    if (!properties.product_id) return await this.handleSkip(jobId, this.handlingProductProcess.name, 'Odoo Product Id Not Found');
    const product = await this.hubspotService.processProducts(jobId, properties, odooEvent);

    this.logger.debug(`HubSpot Product ${JSON.stringify(product)}`);

    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
  }

  private async getInvoiceId(jobId: string, event: PaymentCreatedEvent, context: string): Promise<string> {
    const invoiceId = await this.hubspotService.fetchInVoiceByOdooInVoiceId(jobId, event?.invoice_id);

    if (!invoiceId) {
      await this.handleSkip(jobId, context, 'Invoice Not Found Or Search Api Failure');
    }

    return invoiceId as string;
  }

  private async getDealId(jobId: string, invoiceId: string, context: string): Promise<string> {
    const dealId = await this.hubspotService.fetchAssociatedDealIdByInVoiceId(invoiceId, jobId);

    if (!dealId) {
      await this.handleSkip(jobId, context, 'Deal Not Associated With Invoice');
    }

    return dealId as string;
  }

  private async getDeal(jobId: string, dealId: string) {
    return this.hubspotService.fetchDeal(jobId, dealId);
  }

  private async buildPaymentUpdatePayload(deal: SimplePublicObjectWithAssociations, event: PaymentCreatedEvent) {
    const { stage, amount, odoo_payment_amount } = deal.properties;

    const totalAmount = Number(amount);
    const paidAmount = Number(event?.amount_paid);

    const payload: Record<string, any> = {
      odoo_payment_amount: paidAmount,
      odoo_last_payment_date: toHubspotDateValue(event.payment_date),
    };

    if (paidAmount >= totalAmount) {
      payload.stage = await this.configService.get<string>('HUBSPOT_DEAL_STAGE_CLOSED_WON');
    }

    this.logger.debug(`[buildPaymentUpdatePayload]`, {
      existingStage: stage,
      oldPaid: odoo_payment_amount,
      newPaid: paidAmount,
    });

    return payload;
  }

  private async updateDeal(jobId: string, dealId: string, payload: Record<string, any>) {
    await this.hubspotService.updateDealById(jobId, dealId, payload);
  }

  private async handleInvoiceProcess(
    jobId: string,
    deal: SimplePublicObjectWithAssociations,
    paymentEvent: PaymentCreatedEvent,
    invoiceId: string,
    contacts: SimplePublicObject[],
  ): Promise<void> {
    const createCustomLineItemRecord = await this.hubspotService.processCreateLinetems(jobId, deal.id, paymentEvent);
    const { odoo_invoice_id, odoo_quotation_id } = (await this.hubspotService.fetchInvoiceById(jobId, invoiceId)).properties;
    const invoice = await this.hubspotService.processInvoice(
      jobId,
      { invoice_id: odoo_invoice_id ?? '', quotation_id: odoo_quotation_id ?? '' },
      deal,
      [createCustomLineItemRecord],
      contacts,
    );
    this.logger.log(`Invoice Created Amount as : ${paymentEvent.amount_paid} : ${JSON.stringify(invoice)}`);
  }

  /**
   * =========================
   * PAYMENT FLOW
   * =========================
   */
  public async handlingPaymentCreateEvent(jobId: string, event: PaymentCreatedEvent, eventName?: string) {
    const context = this.handlingPaymentCreateEvent.name;

    this.logger.debug(`[${context}] Started`, { jobId, eventName });

    const invoiceId = await this.getInvoiceId(jobId, event, context);
    if (!invoiceId) return;
    const dealId = await this.getDealId(jobId, invoiceId, context);
    const dealsMetaData = await this.hubspotService.getDealDetails(dealId, jobId);
    const contacts = dealsMetaData?.contacts ?? [];
    const deal = dealsMetaData.deal;

    const payload = await this.buildPaymentUpdatePayload(deal, event);
    delete payload.stage;

    if (payload.amount !== event.amount_paid.toString()) {
      await this.handleInvoiceProcess(jobId, deal, event, invoiceId, contacts);
    }

    await this.updateDeal(jobId, dealId, payload);

    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);

    this.logger.debug(`[${context}] Completed`, { jobId });
  }
}
