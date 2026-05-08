import { QueueStatus } from '@common/entities';
import { QueueRepository } from '@common/repositories';
import { toHubspotDateValue } from '@common/utils';
import { SimplePublicObject, SimplePublicObjectWithAssociations } from '@hubspot/api-client/lib/codegen/crm/companies';
import { PublicOwner } from '@hubspot/api-client/lib/codegen/crm/owners/models/all';
import { CreateQuotationResponse, QuoteCvtInvoice, SalesOrder, SearchReadParams, ValsList } from '@libs/odoo/interfaces';
import { PaymentMethod } from '@modules/hubspot/dto/quotation-flow.dto';
import { HubspotService } from '@modules/hubspot/hubspot.service';
import { InvoiceCreatedEvent, PaymentCreatedEvent, ProductCreateEvent, ProductUpdateEvent, QuotationStatusUpdateEvent } from '@modules/odoo/interfaces/event.interfaces';
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
      const { deal, contacts, lineItems } = await this.hubspotService.getDealDetails(dealId, jobId);

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

      let hsOwner;
      if (deal?.properties?.hubspot_owner_id) {
        hsOwner = await this.hubspotService.fetchOwnerById(jobId, deal?.properties?.hubspot_owner_id as string);
      }

      const quoteTemplates = (await this.hubspotService.fetchQuoteTemplates(jobId))?.results?.find(
        (v) => v.properties?.hs_type == 'customizable_quote_template' && v.properties?.hs_name == 'Default Original',
      );

      const quoteId = await this.hubspotService.quoteProcess(jobId, dealId, deal.properties, quotation.quotation_id, lineItems, hsOwner as PublicOwner, quoteTemplates?.id);

      if (!quoteId) return await this.handleSkip(jobId, context, 'Quote creation failed');

      const { hs_quote_amount } = (await this.hubspotService.fetchQuote(jobId, quoteId.id))?.properties;

      if (hs_quote_amount) await this.updateDeal(jobId, dealId, { amount: hs_quote_amount });

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
  private async handleOfflineFlow(jobId: string, quoteId: string, quotation: Partial<CreateQuotationResponse>) {
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
    quotation: Partial<CreateQuotationResponse>,
    deal: SimplePublicObjectWithAssociations,
    lineItems: SimplePublicObject[],
    contact: SimplePublicObject[],
  ) {
    this.logger.log(`[handleOnlineFlow] Converting quotation to invoice`, {
      jobId,
      quotationId: quotation?.quotation_id,
    });

    const invoice = await this.odooService.ProcessQuotationtoInvoice(jobId, quotation?.quotation_id as string);

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
  public async handleSkip(jobId: string, context: string, reason: string): Promise<void> {
    this.logger.warn(`[${context}] Skipped`, { jobId, reason });

    await this.queueRepository.updateStatus(jobId, QueueStatus.SKIPPED, undefined, reason);

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
    const { dealstage, amount, odoo_payment_amount } = deal.properties;
    const odooTotalPaymentDone = deal?.propertiesWithHistory?.odoo_payment_amount?.map((opa) => Number(opa?.value ?? '0'))?.reduce((p, v) => p + v, 0);

    const totalAmount = amount;
    const paidAmount = event?.amount_paid ?? event?.['amount'];

    const payload: Record<string, any> = {
      odoo_payment_amount: paidAmount,
      odoo_last_payment_date: toHubspotDateValue(event?.payment_date),
      total_amount_paid: (odooTotalPaymentDone ?? 0) + paidAmount,
    };

    // if (paidAmount >= totalAmount) {
    //   payload.stage = await this.configService.get<string>('HUBSPOT_DEAL_STAGE_CLOSED_WON');
    // }

    this.logger.debug(`[buildPaymentUpdatePayload]`, {
      existingStage: dealstage,
      oldPaid: odoo_payment_amount,
      newPaid: paidAmount,
      dealAmount: totalAmount,
    });

    return payload;
  }

  private async updateDeal(jobId: string, dealId: string, payload: Record<string, any>) {
    await this.hubspotService.updateDealById(jobId, dealId, payload);
  }

  private async handleInvoiceProcess(
    jobId: string,
    deal: SimplePublicObjectWithAssociations,
    event: InvoiceCreatedEvent,
    invoiceId: string,
    contacts: SimplePublicObject[],
    lineItems: SimplePublicObject[],
  ): Promise<void> {
    // const createCustomLineItemRecord = await this.hubspotService.processCreateLinetems(jobId, deal.id, event);
    // const { odoo_invoice_id, odoo_quotation_id } = (await this.hubspotService.fetchInvoiceById(jobId, invoiceId)).properties;
    const invoice = await this.hubspotService.processInvoice(
      jobId,
      { invoice_id: event?.invoice_id ?? invoiceId ?? '', quotation_id: event.quotation_id ?? '' },
      deal,
      lineItems,
      contacts,
    );
    this.logger.log(`Invoice Created  : ${JSON.stringify(invoice)}`);
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
    delete payload?.dealstage;
    this.logger.debug(`Deal Properties : ${JSON.stringify(payload)}`);

    // if (payload?.amount !== event?.amount_paid?.toString()) {
    //   await this.handleInvoiceProcess(jobId, deal, event, invoiceId, contacts);
    // }

    await this.updateDeal(jobId, dealId, payload);

    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);

    this.logger.debug(`[${context}] Completed`, { jobId });
  }

  public async handlingInvoiceCreated(jobId: string, event: InvoiceCreatedEvent, eventName?: string): Promise<void> {
    this.logger.debug(`${this.handleInvoiceProcess.name} : ${eventName}`);
    const context = this.handlingInvoiceCreated.name;

    if (!event.quotation_id) return await this.handleSkip(jobId, context, `Quotation id not found Existing Invoice Id : ${event.invoice_id}`);
    const quoteId = await this.hubspotService.fetchQuoteByOdooQuoteId(jobId, event.quotation_id as string);
    if (!quoteId) return await this.handleSkip(jobId, context, `Quotation id : ${event.quotation_id} Quote Not Found`);
    const dealId = await this.hubspotService.fetchAssociatedDealIdByQuoteId(quoteId as string, jobId);
    if (!dealId) return await this.handleSkip(jobId, context, `Quotation id : ${event.quotation_id} Not Associated deal Or Deal Not Found`);
    const { deal, contacts, lineItems } = await this.hubspotService.getDealDetails(dealId, jobId);
    const isAlreadyExistDeal = await this.hubspotService.fetchAssociatedDealIdByInVoiceId(event?.invoice_id, jobId);
    if (isAlreadyExistDeal) return await this.handleSkip(jobId, context, `: ${event.invoice_id} - invoice already create invoice and associated with deal - ${isAlreadyExistDeal}`);
    await this.handleInvoiceProcess(jobId, deal, event, event.invoice_id, contacts ?? [], lineItems ?? []);
    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);

    this.logger.debug(`[${context}] Completed`, { jobId });
  }

  private quoteStatusMapping(status: string): string {
    const mapping: Record<string, string> = {
      confirmed: 'APPROVED',
      done: 'APPROVED',
      cancel: 'REJECTED',
    };

    return mapping[status] || 'DRAFT';
  }

  public async handlingQuotaionStatus(jobId: string, event: QuotationStatusUpdateEvent, eventName?: string) {
    this.logger.debug(`${this.handlingQuotaionStatus.name} : ${eventName}`);
    const context = this.handlingQuotaionStatus.name;

    if (!event.quotation_id) return await this.handleSkip(jobId, context, `Quotation id not found  Status: ${event.new_status}`);
    const quoteId = await this.hubspotService.fetchQuoteByOdooQuoteId(jobId, event.quotation_id as string);
    if (!quoteId) return await this.handleSkip(jobId, context, `Quotation id : ${event.quotation_id} Quote Not Found`);

    if (event.new_status) {
      const status = this.quoteStatusMapping(event?.new_status);
      await this.hubspotService.updateQuoteById(jobId, quoteId, {
        hs_status: status,
        hs_template_type: 'CUSTOMIZABLE_QUOTE_TEMPLATE',
        hs_slug: event.quotation_id,
        hs_domain: '342994076.hs-sites-na3.com',
      });
      //TODO: Require to update the quote template based on client requirement.
    }

    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
    this.logger.debug(`[${context}] Completed`, { jobId });
  }

  public async odooSearchUpsertContactProcess(jobId: string, contact: SimplePublicObject, companyId: string): Promise<number | null> {
    const searchPayload = (await this.odooService.buildOdooObjectSearchPayload(contact, companyId)) as ValsList | SearchReadParams;
    const contactRead = await this.odooService.searchContactRead(jobId, searchPayload as SearchReadParams, 'email');
    if (contactRead.length) {
      await this.hubspotService.updateContactById(jobId, contact.id, { odoo_contact_id: contactRead?.[0]?.id });
      return contactRead?.[0]?.id;
    }
    const writeContactPayload = (await this.odooService.buildOdooObjectSearchPayload(contact, companyId, true, 'contacts')) as ValsList;
    const createContact = await this.odooService.searchContactWrite(jobId, writeContactPayload, 'email');
    await this.hubspotService.updateContactById(jobId, contact.id, { odoo_contact_id: createContact?.[0] });
    return createContact?.[0];
  }

  public async dealPipeLineByGetCompanyId(jobId: string, deal: SimplePublicObject): Promise<number | null> {
    const searchPayload = (await this.odooService.buildOdooObjectSearchPayload(deal, '')) as ValsList | SearchReadParams;
    const searchCompany = await this.odooService.searchCompanyRead(jobId, searchPayload as SearchReadParams, 'name');
    return searchCompany[0]?.id;
  }

  private async handleOdooInvoiceUpsertProcess(
    jobId: string,
    deal: SimplePublicObject,
    lineItems: SimplePublicObject[],
    odooContactId: string,
    odoocompanyId: string,
    odooQuoteId: string,
    hubspotContact: SimplePublicObject,
  ) {
    this.logger.log(`[handleOnlinePayment] Converting quotation to invoice`, {
      jobId,
      odooQuoteId,
    });
    const payload = (await this.odooService.buildOdooObjectSearchPayload(deal, odoocompanyId, true, 'invoice', odooContactId, lineItems)) as QuoteCvtInvoice;
    const odooInvoice = await this.odooService.searchQuoteCvtInvoice(jobId, payload, 'quotation_id');
    if (!odooInvoice) return await this.handleSkip(jobId, `${this.handleOdooInvoiceUpsertProcess.name}`, 'Odoo Invoice convert failed');

    /** Create hubspot invoice and associate with deal */
    const createInvoice = await this.hubspotService.processInvoice(jobId, { quotation_id: odooQuoteId, invoice_id: String(odooInvoice?.[0]) }, deal, lineItems, [hubspotContact]);

    this.logger.log(`[handleOnlinePayment] Invoice created`, {
      jobId,
      odooInvoiceId: odooInvoice?.[0],
      hubspotInvoiceId: createInvoice.id,
    });

    if (!createInvoice.id) return await this.handleSkip(jobId, `${this.handleOdooInvoiceUpsertProcess.name}`, 'Hubspot Invoice Create failed');

    /** Update quotation invoice id into the hubspot invoice */

    // await this.hubspotService.updateQuoteById(jobId, quoteId, {
    //   odoo_invoice_id: invoice.invoice_id,
    //   odoo_quotation_id: invoice.quotation_id,
    // });

    /** Generate payment link and update in deal */
  }

  async odooSalesOrderExecution(dealId: string, jobId: string) {
    const context = this.odooSalesOrderExecution.name;

    this.logger.log(`[${context}] Started`, { jobId, dealId });

    try {
      const { deal, contacts, lineItems } = await this.hubspotService.getDealDetails(dealId, jobId);

      this.logger.log(`[${context}] Deal data fetched`, {
        jobId,
        contactsCount: contacts.length,
        lineItemsCount: lineItems.length,
      });
      if (!contacts.length) return await this.handleSkip(jobId, context, 'Deal Associated Contact Not Found');

      const stageIds = this.configService.get<string>('HUBSPOT_QUOTATION_STAGE_IDS')?.split(',');

      this.logger.debug(`Deal Stage Ids : ${stageIds}`);

      if (!stageIds?.includes(deal.properties.dealstage as string)) return await this.handleSkip(jobId, context, 'Deal Stage not Quotation Process');

      // const companyId = await this.dealPipeLineByGetCompanyId(jobId, deal);

      const pipelineCompanyMap = JSON.parse(this.configService.get<string>('HUBSPOT_PIPELINE_ODOO_COMPANY_MAP') || '{}');

      const pipelineId = deal?.properties?.pipeline as string;

      // pipeline id based company id
      const companyId = pipelineCompanyMap[pipelineId] || '';

      if (!companyId) return await this.handleSkip(jobId, context, 'Odoo Product Not Found based on deal pipeline');

      const primaryContact: SimplePublicObject = contacts?.[0];

      const odooContactId = await this.odooSearchUpsertContactProcess(jobId, primaryContact, String(companyId));

      if (!odooContactId) return await this.handleSkip(jobId, context, 'No associated contact found');

      const offlinePaymentMethod = [PaymentMethod.CASH, PaymentMethod.CREDIT, PaymentMethod.DEBIT];

      const isOffline = offlinePaymentMethod.includes(deal?.properties?.payment_method as unknown as PaymentMethod);

      this.logger.debug(`total Line Items: ${lineItems.length}`);
      if (!lineItems.length) return await this.handleSkip(jobId, context, 'No Associated LinItems');

      const quote = (await this.odooService.buildOdooObjectSearchPayload(deal, String(companyId), true, 'deals', odooContactId, lineItems)) as ValsList;
      const salesOrder = quote.vals_list[0] as SalesOrder;
      const orderLines = salesOrder?.order_line;
      if (!orderLines.length) return await this.handleSkip(jobId, context, 'Invalid Line Items Or No Odoo Product Id');
      const quotation = await this.odooService.searchSaleOrderCreation(jobId, quote, 'odoo_quotation_id');

      this.logger.log(`[${context}] Quotation created`, {
        jobId,
        quotationId: quotation?.[0],
      });
      this.logger.verbose(`Payment Method : ${deal?.properties?.payment_method}`);

      let hsOwner;
      if (deal?.properties?.hubspot_owner_id) {
        hsOwner = await this.hubspotService.fetchOwnerById(jobId, deal?.properties?.hubspot_owner_id as string);
      }

      const quoteTemplates = (await this.hubspotService.fetchQuoteTemplates(jobId))?.results?.find(
        (v) => v.properties?.hs_type == 'customizable_quote_template' && v.properties?.hs_name == 'Default Original',
      );

      const quoteId = await this.hubspotService.quoteProcess(jobId, dealId, deal.properties, String(quotation?.[0]), lineItems, hsOwner as PublicOwner, quoteTemplates?.id);

      if (!quoteId) return await this.handleSkip(jobId, context, 'Quote creation failed');

      const { hs_quote_amount } = (await this.hubspotService.fetchQuote(jobId, quoteId.id))?.properties;

      if (hs_quote_amount) await this.updateDeal(jobId, dealId, { amount: hs_quote_amount });

      if (isOffline) {
        await this.handleOfflineFlow(jobId, quoteId.id as string, { quotation_id: String(quotation[0]) });
      } else {
        await this.handleOdooInvoiceUpsertProcess(jobId, deal, lineItems, String(odooContactId), String(companyId), String(quotation[0]), primaryContact);
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
}
