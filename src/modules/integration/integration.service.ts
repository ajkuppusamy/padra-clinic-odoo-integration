import { QueueStatus } from '@common/entities';
import { HubspotObjects } from '@common/enums';
import { QueueRepository } from '@common/repositories';
import { toHubspotDateValue } from '@common/utils';
import {
  AssociationSpecAssociationCategoryEnum,
  BatchInputSimplePublicObjectBatchInput,
  BatchInputSimplePublicObjectBatchInputForCreate,
  HttpFile,
  SimplePublicObject,
  SimplePublicObjectInputForCreate,
  SimplePublicObjectWithAssociations,
} from '@hubspot/api-client/lib/codegen/crm/companies';
import { PublicOwner } from '@hubspot/api-client/lib/codegen/crm/owners/models/all';
import { HubDiscountType } from '@libs/hubspot/enums/discount-type.enum';
import { DiscountType } from '@libs/odoo/enums';
import {
  BaseSearch,
  ContactSearchResponse,
  CreateDiscount,
  CreateQuotationResponse,
  SaleOrderLineUpdateWebhook,
  SalesOrder,
  SearchReadParams,
  ValsList,
} from '@libs/odoo/interfaces';
import { HubspotWebhookDto } from '@modules/hubspot/dto';
import { PaymentMethod } from '@modules/hubspot/dto/quotation-flow.dto';
import { HubspotService } from '@modules/hubspot/hubspot.service';
import { CloseServiceWebhook, InvoiceCreatedEvent, PaymentCreatedEvent, ProductCreateEvent, ProductUpdateEvent, QuotationStatusUpdateEvent } from '@modules/odoo/interfaces';
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
   * @deprecated This is the old function.
   * Please use `odooSalesOrderExecution()` instead.
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
   * @deprecated This method is no longer in use.
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
   * @deprecated This method no longer handles product events.
   * Use `handleProductEventProcess` instead.
   */
  public async handlingProductProcess(jobId: string, properties: ProductCreateEvent | ProductUpdateEvent, odooEvent?: string) {
    if (!properties.product_id) return await this.handleSkip(jobId, this.handlingProductProcess.name, 'Odoo Product Id Not Found');
    const product = await this.hubspotService.processProducts(jobId, properties, odooEvent);

    this.logger.debug(`HubSpot Product ${JSON.stringify(product)}`);

    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
  }

  private async getInvoiceId(jobId: string, event: PaymentCreatedEvent, context: string): Promise<string | void> {
    const paymentInvoiceId = event?.invoice_ids?.[0];

    if (!paymentInvoiceId) return await this.handleSkip(jobId, context, 'Invoice Not Found in Webhook data');

    const invoiceId = await this.hubspotService.fetchInVoiceByOdooInVoiceId(jobId, paymentInvoiceId as unknown as string);

    if (!invoiceId) return await this.handleSkip(jobId, context, 'Invoice Not Found Or Search Api Failure');

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
    return this.hubspotService.fetchDeal(dealId, jobId);
  }

  private async buildPaymentUpdatePayload(deal: SimplePublicObjectWithAssociations, event: PaymentCreatedEvent) {
    const { dealstage, amount, odoo_payment_amount } = deal.properties;
    const odooTotalPaymentDone = deal?.propertiesWithHistory?.odoo_payment_amount?.map((opa) => Number(opa?.value ?? '0'))?.reduce((p, v) => p + v, 0);

    const totalAmount = amount;
    const paidAmount = event?.amount_paid ?? (event?.amount as number);

    const payload: Record<string, any> = {
      odoo_payment_amount: paidAmount,
      odoo_last_payment_date: toHubspotDateValue(event?.payment_date),
      total_amount_paid: (odooTotalPaymentDone ?? 0) + paidAmount,
    };

    // if (paidAmount >= totalAmount) {
    //   payload.stage = await this.configService.get<string>('HUBSPOT_DEAL_STAGE_CLOSED_WON');
    // }

    this.logger.debug(`[buildPaymentUpdatePayload]`, payload);

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
    status?: 'paid' | 'open' | 'draft',
  ): Promise<void> {
    // const createCustomLineItemRecord = await this.hubspotService.processCreateLinetems(jobId, deal.id, event);
    // const { odoo_invoice_id, odoo_quotation_id } = (await this.hubspotService.fetchInvoiceById(jobId, invoiceId)).properties;
    const invoice = await this.hubspotService.processInvoice(
      jobId,
      { invoice_id: event?.invoice_id ?? invoiceId ?? '', quotation_id: event?.quotation_id ?? event?.order_id ?? '' },
      deal,
      lineItems,
      contacts,
      status,
    );
    this.logger.log(`Invoice Created  : ${JSON.stringify(invoice)}`);
  }

  private isSalesOrderIsDiscounted(deal: SimplePublicObjectWithAssociations): boolean {
    this.logger.debug(`${this.isSalesOrderIsDiscounted.name} -  Discount Type ${deal?.properties?.discount_type}`);
    const discountType = deal?.properties?.discount_type as unknown as HubDiscountType;
    return [HubDiscountType.FIXED_AMOUNT, HubDiscountType.PERCENTAGE].includes(discountType);
  }

  public async handlingDiscountProcess(jobId: string, deal: SimplePublicObjectWithAssociations) {
    this.logger.debug(`${this.handlingDiscountProcess.name}`);
    const dealId = deal?.id;

    const { discount_type, percentage_discount, fixed_amount_discount } = deal?.properties;

    const quoteId = await this.hubspotService.fetchAssociatedQuoteByDealId(dealId, jobId);

    if (!quoteId) {
      await this.handleSkip(jobId, this.handlingDiscountProcess.name, `Quote Not Found. Deal Id: ${dealId}`);
      return;
    }

    const quote = await this.hubspotService.fetchQuote(jobId, quoteId as string);

    const { odoo_quotation_id } = quote?.properties;

    if (!odoo_quotation_id) {
      await this.handleSkip(jobId, this.handlingDiscountProcess.name, `Deal and Quote exist but Odoo Quotation Id is missing`);
      return;
    }

    const discountType = discount_type as HubDiscountType;

    const discountPayload: CreateDiscount = {
      sale_order_id: Number(odoo_quotation_id),
    };

    if (discountType === HubDiscountType.FIXED_AMOUNT) {
      discountPayload.discount_amount = Number(fixed_amount_discount || 0);
      discountPayload.discount_type = DiscountType.FIXED_AMOUNT;
    }

    if (discountType === HubDiscountType.PERCENTAGE) {
      // Example: "12.5" -> 12.5 (float)
      discountPayload.discount_percentage = parseFloat(String(percentage_discount || 0));
      discountPayload.discount_type = DiscountType.GLOBAL_DISCOUNT;
    }

    const applyDiscount: ValsList = {
      vals_list: [discountPayload],
    };

    const discount = await this.odooService.salesOrderDiscountCreate(jobId, applyDiscount, discountType);
    this.logger.debug(`Sales Order Sucess Fully Discount Applied : ${JSON.stringify(discount)}`);
    const discountId = discount?.[0] as number;

    if (!discountId) {
      await this.handleSkip(jobId, this.handlingDiscountProcess.name, `Discount record not created`);
      return;
    }

    const conformation = await this.odooService.salesOrderDiscountConformation(jobId, { ids: [discountId], context: {} }, 'id');

    this.logger.debug(`Conformation data : ${JSON.stringify(conformation)}`);

    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
    return;
  }

  private async isAdvancedPayment(jobId: string, event: PaymentCreatedEvent, eventName?: string): Promise<boolean> {
    this.logger.debug(`${this.isAdvancedPayment.name} : ${eventName}`);
    const payload: SearchReadParams = {
      domain: [['id', '=', `${event?.payment_id}`]],
      fields: ['display_name', 'is_advance_payment', 'sale_order_id'],
    };
    const paymentSearch = await this.odooService.paymentSearch(jobId, payload, 'is_advance_payment');
    const isAdvancePayment = paymentSearch?.[0]?.is_advance_payment;
    this.logger.debug(`${this.isAdvancedPayment.name} : ${eventName}`, { isAdvancePayment });
    return isAdvancePayment === true || isAdvancePayment === 'true';
  }

  private async handlingAdvancePayment(jobId: string, event: PaymentCreatedEvent, eventName?: string) {
    this.logger.debug(`${this.logger.debug(`${this.handlingAdvancePayment.name}`)}`);
    const payload: SearchReadParams = {
      domain: [['id', '=', `${event?.payment_id}`]],
      fields: ['display_name', 'is_advance_payment', 'sale_order_id'],
    };
    const paymentSearch = await this.odooService.paymentSearch(jobId, payload, 'is_advance_payment');
    const saleOrderId = paymentSearch?.[0]?.sale_order_id?.[0];
    if (!saleOrderId) {
      await this.handleSkip(jobId, this.handlingAdvancePayment.name, 'Sale order id not found for advance payment');
      return;
    }
    const quoteId = await this.hubspotService.fetchQuoteByOdooQuoteId(jobId, String(saleOrderId));
    if (!quoteId) {
      await this.handleSkip(jobId, this.handlingAdvancePayment.name, `Quote not found for sale order id : ${saleOrderId}`);
      return;
    }

    const dealId = await this.hubspotService.fetchAssociatedDealIdByQuoteId(quoteId, jobId);
    if (!dealId) {
      await this.handleSkip(jobId, this.handlingAdvancePayment.name, `Deal not found based on Quote Id : ${quoteId}`);
      return;
    }
    const deal = await this.hubspotService.fetchDeal(dealId, jobId);
    const dealProperties = await this.buildPaymentUpdatePayload(deal, event);
    this.logger.debug('dealProperties before updateDeal:', {
      jobId,
      dealId,
      dealProperties: JSON.stringify(dealProperties),
      hasProperties: !!dealProperties,
      propertyKeys: Object.keys(dealProperties),
    });
    await this.updateDeal(jobId, dealId, dealProperties);
    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
    return;
  }

  public async handlingRefund(jobId: string, event: PaymentCreatedEvent, dealId: string) {
    this.logger.debug(`${this.handlingRefund.name}`);
    const properties = { sales_order_refund_amount: event?.amount ?? '', sales_order_refund_reason: event?.memo ?? '' };
    await this.updateDeal(jobId, dealId, properties);
    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
    return;
  }

  /**
   * =========================
   * PAYMENT FLOW
   * =========================
   */
  public async handlingPaymentCreateEvent(jobId: string, event: PaymentCreatedEvent, eventName?: string) {
    const context = this.handlingPaymentCreateEvent.name;

    this.logger.debug(`[${context}] Started`, { jobId, eventName });

    const isAdvancePayment = await this.isAdvancedPayment(jobId, event, eventName);

    if (isAdvancePayment) {
      await this.handlingAdvancePayment(jobId, event, eventName);
      return;
    }

    const invoiceId = await this.getInvoiceId(jobId, event, context);
    if (!invoiceId) return;
    const dealId = await this.getDealId(jobId, invoiceId, context);
    const dealsMetaData = await this.hubspotService.getDealDetails(dealId, jobId);
    const deal = dealsMetaData.deal;

    const payload = await this.buildPaymentUpdatePayload(deal, event);
    delete payload?.dealstage;
    this.logger.debug(`Deal Properties : ${JSON.stringify(payload)}`);

    // if (payload?.amount !== event?.amount_paid?.toString()) {
    //   await this.handleInvoiceProcess(jobId, deal, event, invoiceId, contacts);
    // }

    if (event.payment_type === 'outbound') {
      return await this.handlingRefund(jobId, event, dealId);
    }

    await this.updateDeal(jobId, dealId, payload);

    const totalAmount = Number(deal?.properties?.amount ?? 0);
    const totalPaidAmount = Number(payload?.total_amount_paid ?? 0);

    let invoiceStatus = 'open';
    if (totalPaidAmount >= totalAmount) {
      invoiceStatus = 'paid';
    }

    if (invoiceId)
      await this.hubspotService.updateInvoiceById(jobId, invoiceId, {
        hs_invoice_status: invoiceStatus,
      });

    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);

    this.logger.debug(`[${context}] Completed`, { jobId });
  }

  public async handlingInvoiceCreated(jobId: string, event: InvoiceCreatedEvent, eventName?: string, isCompleted?: boolean): Promise<void> {
    this.logger.debug(`${this.handleInvoiceProcess.name} : ${eventName}`);
    const context = this.handlingInvoiceCreated.name;

    // Prefer order_id first, fallback to quotation_id
    const referenceId = event?.order_id ?? event?.quotation_id;
    const invoiceId = event?.invoice_id || event?.move_id;

    if (!referenceId) return await this.handleSkip(jobId, context, `Order id / Quotation id not found Existing Invoice Id : ${invoiceId}`);

    const quoteId = await this.hubspotService.fetchQuoteByOdooQuoteId(jobId, referenceId);

    if (!quoteId) return await this.handleSkip(jobId, context, `Reference id : ${referenceId} Quote Not Found`);

    const dealId = await this.hubspotService.fetchAssociatedDealIdByQuoteId(quoteId as string, jobId);

    if (!dealId) return await this.handleSkip(jobId, context, `Reference id : ${referenceId} Deal Not Associated / Not Found`);

    const { deal, contacts, lineItems } = await this.hubspotService.getDealDetails(dealId, jobId);

    // const isAlreadyExistDeal = await this.hubspotService.fetchAssociatedDealIdByInVoiceId(invoiceId as string, jobId);
    // if (isAlreadyExistDeal) return await this.handleSkip(jobId, context, `${invoiceId} - invoice already created and associated with deal - ${isAlreadyExistDeal}`);
    const isAreadExistInvoiceId = await this.hubspotService.fetchInVoiceByOdooInVoiceId(jobId, invoiceId as string);

    const isOpen = event.state === 'posted';
    if (isAreadExistInvoiceId) {
      await this.hubspotService.updateInvoiceById(jobId, isAreadExistInvoiceId, {
        hs_invoice_status: isOpen ? 'open' : 'draft',
      });
      return await this.handleSkip(jobId, context, `${invoiceId} - Invoice already exist with id ${isAreadExistInvoiceId}, updated status to ${isOpen ? 'open' : 'draft'}`);
    }
    await this.handleInvoiceProcess(jobId, deal, event, invoiceId as string, contacts ?? [], lineItems ?? [], isOpen ? 'open' : 'draft');

    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);

    this.logger.debug(`[${context}] Completed`, { jobId });
  }

  private quoteStatusMapping(status: string): string {
    const mapping: Record<string, string> = {
      draft: 'DRAFT', // Quotation
      sent: 'PENDING_APPROVAL', // Quotation Sent
      sale: 'APPROVED', // Sales Order
      confirmed: 'APPROVED',
      done: 'APPROVED',
      cancel: 'REJECTED', // Cancelled
    };

    return mapping[status] || 'DRAFT';
  }

  public async handlingQuotaionStatus(jobId: string, event: QuotationStatusUpdateEvent, eventName?: string) {
    this.logger.debug(`${this.handlingQuotaionStatus.name} : ${eventName}`);
    const context = this.handlingQuotaionStatus.name;

    // Prefer order_id first, fallback to quotation_id
    const referenceId = String(event?.order_id) || String(event?.quotation_id);

    if (!referenceId) return await this.handleSkip(jobId, context, `Order id / Quotation id not found Status: ${event.new_status}`);

    await new Promise((resolve) => setTimeout(resolve, 3000));
    const quoteId = await this.hubspotService.fetchQuoteByOdooQuoteId(jobId, referenceId);

    if (!quoteId) return await this.handleSkip(jobId, context, `Reference id : ${referenceId} Quote Not Found`);

    if (event.new_status) {
      const status = this.quoteStatusMapping(event.new_status);

      const portalId = await this.configService.get<string>('HUBSPOT_PORTAL_ID');

      await this.hubspotService.updateQuoteById(jobId, quoteId, {
        hs_status: status,
        hs_template_type: 'CUSTOMIZABLE_QUOTE_TEMPLATE',
        hs_slug: referenceId,
        hs_domain: `${portalId}.hs-sites-na3.com`,
      });

      // TODO: Update quote template based on client requirement
    }

    if (event?.new_status === 'cancel') {
      const dealId = await this.hubspotService.fetchAssociatedDealIdByQuoteId(quoteId as string, jobId);

      if (!dealId) {
        await this.handleSkip(jobId, context, `Reference id : ${referenceId} Deal Not Associated / Not Found`);
        return;
      }

      const { properties } = await this.hubspotService.fetchDeal(dealId, jobId);

      const { pipeline, dealstage, branch } = properties as unknown as any;

      const pipelineStageMap = JSON.parse(this.configService.get<string>('HUBSPOT_PIPELINE_ID_TO_CLOSE_LOST_STAGE_ID_MAP') || '{}');
      const closedLostId = pipelineStageMap[pipeline];
      this.logger.debug(`${this.handlingQuotaionStatus.name} - Existing PipeLine : ${pipeline} , Stage : ${dealstage} , branch : ${branch} --> Pipeline Id : ${closedLostId}`);

      const updateProperties = {
        dealstage: closedLostId,
      };
      await this.hubspotService.updateDealById(jobId, dealId, updateProperties);
      await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
      return;
    }

    const dealId = await this.hubspotService.fetchAssociatedDealIdByQuoteId(quoteId as string, jobId);
    if (!dealId) {
      await this.handleSkip(jobId, context, `Reference id : ${referenceId} Deal Not Associated / Not Found`);
      return;
    }

    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
    this.logger.debug(`[${context}] Completed`, { jobId });
  }

  public async saleOrderlineUpdate(jobId: string, event: SaleOrderLineUpdateWebhook, eventName?: string) {
    this.logger.debug(`${this.saleOrderlineUpdate.name} : ${eventName}`);
    const context = this.saleOrderlineUpdate.name;

    // Prefer order_id first, fallback to quotation_id
    const referenceId = String(event?.sale_order.order_id);

    if (!referenceId) return await this.handleSkip(jobId, context, `Order id / Quotation id not found ${referenceId}`);

    await new Promise((resolve) => setTimeout(resolve, 3000));
    const quoteId = await this.hubspotService.fetchQuoteByOdooQuoteId(jobId, referenceId);

    if (!quoteId) return await this.handleSkip(jobId, context, `Reference id : ${referenceId} Quote Not Found`);

    const dealId = await this.hubspotService.fetchAssociatedDealIdByQuoteId(quoteId as string, jobId);
    if (!dealId) {
      await this.handleSkip(jobId, context, `Reference id : ${referenceId} Deal Not Associated / Not Found`);
      return;
    }

    const { lineItems } = await this.hubspotService.getDealDetails(dealId, jobId);
    await this.syncLineItems(jobId, dealId, event, lineItems);

    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
    this.logger.debug(`[${context}] Completed`, { jobId });
  }

  private async syncLineItems(jobId: string, dealId: string, event: SaleOrderLineUpdateWebhook, lineItems: SimplePublicObject[]): Promise<void> {
    this.logger.debug(`${this.syncLineItems.name}: ${jobId} : deal ID ${dealId} : ${event.sale_order.order_id}`);

    const existingLineItems = new Map(lineItems.filter((item) => item.properties?.odoo_line_item_id).map((item) => [String(item.properties.odoo_line_item_id), item]));

    const batchCreateInput: BatchInputSimplePublicObjectBatchInputForCreate = {
      inputs: [],
    };

    const batchUpdateInput: BatchInputSimplePublicObjectBatchInput = {
      inputs: [],
    };

    const association = [
      {
        to: { id: dealId },
        types: [
          {
            associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined,
            associationTypeId: 20,
          },
        ],
      },
    ];

    const upsert = (lineId: number, properties: Record<string, string>, sumQuantity = false) => {
      const existing = existingLineItems.get(String(lineId));

      if (existing) {
        // const quantity = sumQuantity ? String(Number(existing.properties?.quantity ?? 0) + Number(properties.quantity ?? 0)) : properties.quantity;

        batchUpdateInput.inputs.push({
          id: existing.id,
          properties: {
            ...properties,
            //   quantity,
          },
        });
      } else {
        batchCreateInput.inputs.push({
          properties,
          associations: association,
        });
      }
    };

    const getProperties = (line: any, updated = false) => ({
      name: line.product_name,
      quantity: String(updated ? (line.changed_fields?.quantity?.new ?? 0) : line.quantity),
      price: String(Number(updated ? line.changed_fields?.price_unit?.new : (line.price_unit ?? 0))),
      amount: String(Number(updated ? line.changed_fields?.price_subtotal?.new : (line.price_subtotal ?? 0))),
      ...(updated && {
        discount: String(line.changed_fields?.discount?.new ?? 0),
      }),
      odoo_product_id: String(line.product_id),
      odoo_line_item_id: String(line.line_id),
    });

    for (const line of event.created_lines ?? []) {
      upsert(line.line_id, getProperties(line), true);
    }

    for (const line of event.updated_lines ?? []) {
      upsert(line.line_id, getProperties(line, true));
    }

    await Promise.all([
      batchCreateInput.inputs.length ? this.hubspotService.createBatchLineItems(jobId, batchCreateInput) : Promise.resolve(),
      batchUpdateInput.inputs.length ? this.hubspotService.updateBatchLineItems(jobId, batchUpdateInput) : Promise.resolve(),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const totalAmount = lineItems.reduce((sum, item) => {
      return sum + Number(item.properties?.amount ?? 0);
    }, 0);

    await this.updateDeal(jobId, dealId, {
      amount: String(totalAmount),
    });

    this.logger.verbose(
      `Line Item Sync Completed | Created: ${batchCreateInput.inputs.length} | Updated: ${batchUpdateInput.inputs.length} and Total Amount Updated: ${totalAmount}`,
    );
  }

  private async syncOdooLineItemIds(jobId: string, salesOrderId: number, companyId: number, hubspotLineItems: SimplePublicObject[]): Promise<void> {
    this.logger.debug(`${this.syncOdooLineItemIds.name}: Sales Order ${salesOrderId}`);

    const odooLineItems = (await this.odooService.getLineItemsBySalesOrderbyId(
      jobId,
      {
        domain: [
          ['order_id', '=', salesOrderId],
          ['company_id', '=', companyId],
        ],
      },
      'sale_order_id',
    )) as BaseSearch[];

    if (!odooLineItems.length) {
      this.logger.verbose(`No Odoo line items found for Sales Order ${salesOrderId}`);
      await this.queueRepository.updateStatus(jobId, QueueStatus.SKIPPED, `No Odoo line items found for Sales Order ${salesOrderId}`);
      return;
    }

    const hubspotLineItemMap = new Map<string, SimplePublicObject>((hubspotLineItems ?? []).filter((item) => item.properties?.name).map((item) => [item.properties.name!, item]));

    const batchUpdateInput: BatchInputSimplePublicObjectBatchInput = {
      inputs: [],
    };

    for (const odooLineItem of odooLineItems) {
      const hubspotLineItem = hubspotLineItemMap.get(odooLineItem?.name as string);

      if (!hubspotLineItem) {
        this.logger.warn(`HubSpot Line Item not found: ${odooLineItem.name} for Odoo Line Item ID: ${odooLineItem.id}`);
        continue;
      }

      batchUpdateInput.inputs.push({
        id: hubspotLineItem.id,
        properties: {
          odoo_line_item_id: String(odooLineItem.id),
        },
      });
    }

    if (!batchUpdateInput.inputs.length) {
      this.logger.verbose('No HubSpot Line Items to update.');
      await this.queueRepository.updateStatus(jobId, QueueStatus.SKIPPED, 'No HubSpot Line Items to update.');
      return;
    }
    await this.hubspotService.updateBatchLineItems(jobId, batchUpdateInput);
    this.logger.verbose(`Updated ${batchUpdateInput.inputs.length} HubSpot Line Items with Odoo Line Item IDs.`);
  }

  public async odooUpsertContactProcess(jobId: string, contact: SimplePublicObject, companyId?: string): Promise<number | null> {
    const searchPayload = (await this.odooService.buildOdooObjectPayload(contact, companyId, undefined, 'contacts', {}, [], undefined, undefined, jobId)) as
      | ValsList
      | SearchReadParams;
    const contactRead = await this.odooService.partnerSearch(jobId, searchPayload as SearchReadParams, 'email');
    if (contactRead.length) {
      await this.hubspotService.updateContactById(jobId, contact.id, { odoo_contact_id: contactRead?.[0]?.id });
      return contactRead?.[0]?.id;
    }
    const writeContactPayload = (await this.odooService.buildOdooObjectPayload(contact, companyId, true, 'contacts', {}, [], undefined, undefined, jobId)) as ValsList;
    const createContact = await this.odooService.partnerCreate(jobId, writeContactPayload, 'email');
    await this.hubspotService.updateContactById(jobId, contact.id, { odoo_contact_id: createContact?.[0] });
    return createContact?.[0];
  }

  public async dealPipeLineByGetCompanyId(jobId: string, deal: SimplePublicObject): Promise<number | null> {
    const searchPayload = (await this.odooService.buildOdooObjectPayload(deal, '')) as ValsList | SearchReadParams;
    const searchCompany = await this.odooService.companySearch(jobId, searchPayload as SearchReadParams, 'name');
    return searchCompany[0]?.id;
  }

  private async handleOdooInvoiceUpsertProcess(jobId: string, deal: SimplePublicObject, lineItems: SimplePublicObject[], odooQuoteId: number, hubspotContact: SimplePublicObject) {
    this.logger.log(`[handleOnlinePayment] Converting quotation to invoice`, {
      jobId,
      odooQuoteId,
    });

    const invoiceCreation = await this.odooService.paymentInvoiceCreate(
      jobId,
      {
        vals_list: [
          {
            advance_payment_method: 'delivered',
            sale_order_ids: [odooQuoteId],
          },
        ],
      },
      'advance_payment_method',
    );

    if (!invoiceCreation.length) return await this.handleSkip(jobId, this.handleOdooInvoiceUpsertProcess.name, 'Invoice convert failed');

    const invoiceCreateId = invoiceCreation?.[0];

    const validateInvoice = await this.odooService.paymentInvoiceValidate(
      jobId,
      {
        ids: [invoiceCreateId],
      },
      'id',
    );

    if (!validateInvoice) return await this.handleSkip(jobId, this.handleOdooInvoiceUpsertProcess.name, 'Invoice create validation failed');

    const salesOrderRes = await this.odooService.saleOrderRead(
      jobId,
      {
        ids: [odooQuoteId],
        fields: ['display_name', 'name', 'create_date', 'invoice_ids'],
      },
      'invoice_ids',
    );

    const invoiceId = salesOrderRes?.[0]?.invoice_ids?.[0]?.toString();
    this.logger.verbose(`Invoice Creation Response Id : ${invoiceCreateId}`);
    this.logger.verbose(`Real Odoo Associated Id : ${invoiceId}`);

    const createInvoice = await this.hubspotService.processInvoice(
      jobId,
      {
        quotation_id: String(odooQuoteId),
        invoice_id: invoiceId,
      },
      deal,
      lineItems,
      [hubspotContact],
    );

    if (!createInvoice?.id) return await this.handleSkip(jobId, this.handleOdooInvoiceUpsertProcess.name, 'Hubspot Invoice Create failed');

    this.logger.log(`[handleOnlinePayment] Invoice created`, {
      jobId,
      odooInvoiceCreate: true,
      hubspotInvoiceId: createInvoice.id,
    });

    /** Generate payment link and update in deal */
  }

  async odooSalesOrderExecution(dealId: string, jobId: string) {
    const context = this.odooSalesOrderExecution.name;
    this.logger.log(`[${context}] Started`, {
      jobId,
      dealId,
    });

    try {
      const { deal, contacts, lineItems } = await this.hubspotService.getDealDetails(dealId, jobId);

      const { sales_order_id } = deal.properties;

      if (sales_order_id) return await this.handleSkip(jobId, context, 'Already Quotation Exist');

      const isDiscounted = this.isSalesOrderIsDiscounted(deal);

      if (isDiscounted) {
        await this.handlingDiscountProcess(jobId, deal);
        return;
      }

      this.logger.log(`[${context}] Deal data fetched`, {
        jobId,
        contactsCount: contacts.length,
        lineItemsCount: lineItems.length,
      });
      if (!contacts.length) return await this.handleSkip(jobId, context, 'Deal Associated Contact Not Found');

      // const stageIds = this.configService.get<string>('HUBSPOT_QUOTATION_STAGE_IDS')?.split(',');
      // this.logger.debug(`Deal Stage Ids : ${stageIds}`);
      // if (!stageIds?.includes(deal.properties.dealstage as string)) return await this.handleSkip(jobId, context, 'Deal Stage not Quotation Process');

      // const companyId = await this.dealPipeLineByGetCompanyId(jobId, deal);

      const companyId = (await this.getCompanyIdFromPipeline(jobId, context, deal)) as string;

      if (companyId) {
        const payload: SearchReadParams = {
          ids: [Number(companyId)],
          fields: ['display_name', 'name', 'create_date'],
        };
        const companyData = await this.odooService.readCompanyByIds(jobId, payload, 'id');
        await this.updateDeal(jobId, dealId, { sales_order_company_name: companyData?.[0]?.display_name });
      }

      const odooServicePlanTypeId = await this.getAnalyticAccountByServiceType(jobId, context, companyId, deal);

      // if (!odooServicePlanTypeId) return;

      const primaryContact = contacts?.[0];

      const odooContactId = await this.odooUpsertContactProcess(jobId, primaryContact);

      if (!odooContactId) return await this.handleSkip(jobId, context, 'No associated contact found');

      this.logger.debug(`total Line Items: ${lineItems.length}`);
      if (!lineItems.length) return await this.handleSkip(jobId, context, 'No Associated LinItems');

      const { hsOwner, dealOwnerPartnerId, callCenterDealOwnerPartnerId } = await this.upsertOwnerPartners(jobId, deal);

      const quote = (await this.odooService.buildOdooObjectPayload(
        deal,
        String(companyId),
        true,
        'deals',
        {
          contactId: odooContactId,
          call_centre_deal_owner_id: callCenterDealOwnerPartnerId,
          deal_owner_id: dealOwnerPartnerId,
          odooServicePlanTypeId: odooServicePlanTypeId as string,
        },
        lineItems,
      )) as ValsList;

      const quotation = (await this.createQuotation(jobId, context, quote)) as number[];

      const quoteId = (await this.createHubspotQuote(jobId, context, dealId, deal, quotation, lineItems, hsOwner as PublicOwner)) as SimplePublicObject;

      const offlinePaymentMethod = [PaymentMethod.CASH, PaymentMethod.CREDIT, PaymentMethod.DEBIT];

      const isOffline = offlinePaymentMethod.includes(deal?.properties?.payment_method as PaymentMethod);

      this.logger.verbose(`Payment Method : ${deal?.properties?.payment_method}`);

      if (isOffline) {
        await this.handleOfflineFlow(jobId, quoteId.id as string, {
          quotation_id: String(quotation[0]),
        });
      } else {
        await this.handleOdooInvoiceUpsertProcess(jobId, deal, lineItems, quotation?.[0], primaryContact);
      }

      const reportLink = await this.odooService.generateSalesOrderReportLink(jobId, { ids: [quotation?.[0]] }, 'id');
      await this.hubspotService.updateDealById(jobId, deal.id, { sales_order_id: quotation?.[0], sales_order_preview_link: reportLink ?? '' });

      await this.syncOdooLineItemIds(jobId, quotation?.[0], Number(companyId), lineItems);
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

  private async getCompanyIdFromPipeline(jobId: string, context: string, deal: SimplePublicObjectWithAssociations): Promise<string | void | null> {
    this.logger.debug(`${this.getCompanyIdFromPipeline.name} - Pipeline based company search initiated`);
    const pipelineCompanyMap = JSON.parse(this.configService.get<string>('HUBSPOT_PIPELINE_ODOO_COMPANY_MAP') || '{}');

    const pipelineId = deal?.properties?.pipeline as string;

    // pipeline id based company id
    const companyId = pipelineCompanyMap[pipelineId] || '';

    this.logger.debug(`${this.getCompanyIdFromPipeline.name} - Found company id: ${companyId}`);

    if (!companyId) return await this.handleSkip(jobId, context, 'Odoo Product Not Found based on deal pipeline');

    return companyId;
  }

  private async getAnalyticAccountByServiceType(jobId: string, context: string, companyId: string, deal: SimplePublicObjectWithAssociations): Promise<string | void> {
    this.logger.debug(`${this.getAnalyticAccountByServiceType.name} - Analytic account search initiated based on service type`);
    const odooAnalyticAccountPlanId = await Number(this.configService.get<number | string>('ODOO_ANALYTIC_PLAN_ID') || 0);

    //if (!odooAnalyticAccountPlanId) return await this.handleSkip(jobId, context, 'Odoo Analytic Account Plan Id Not Found');

    const analyticAccounts = await this.odooService.accountAnalyticSearch(
      jobId,
      {
        domain: [
          ['company_id', '=', companyId],
          ['root_plan_id', '=', odooAnalyticAccountPlanId],
        ],
        fields: ['display_name', 'company_id'],
      },
      'company_id',
    );

    //if (!analyticAccounts?.length) return await this.handleSkip(jobId, context, `No Analytic Account Found for company id : ${companyId}`);

    this.logger.debug(`${this.getAnalyticAccountByServiceType.name} - Found analytic accounts: ${analyticAccounts.length}`);

    // if (!deal?.properties?.service_type) return await this.handleSkip(jobId, context, 'Service type is required to process the deal');

    const serviceType = deal.properties.service_type as unknown as string;

    const odooServicePlanTypeId = analyticAccounts?.find((a) => a?.display_name === serviceType)?.id?.toString();

    this.logger.debug(`${this.getAnalyticAccountByServiceType.name} - Service type from deal: ${serviceType} - Mapped Analytic Account Id: ${odooServicePlanTypeId}`);

    // if (!odooServicePlanTypeId) return await this.handleSkip(jobId, context, `No Analytic Account Found for service type : ${serviceType}`);

    return odooServicePlanTypeId;
  }

  private async getOwnerPartnerDetails(
    jobId: string,
    deal: SimplePublicObjectWithAssociations,
  ): Promise<{
    hsOwner: Partial<PublicOwner>;
    callCenterOwner: Partial<PublicOwner>;
    dealOwnerPartner: Partial<ContactSearchResponse> | undefined;
    callCenterDealOwnerPartner: Partial<ContactSearchResponse> | undefined;
  }> {
    let hsOwner: Partial<PublicOwner> = {};
    let callCenterOwner: Partial<PublicOwner> = {};

    let dealOwnerPartner: Partial<ContactSearchResponse> | undefined;

    let callCenterDealOwnerPartner: Partial<ContactSearchResponse> | undefined;

    if (deal?.properties?.hubspot_owner_id) {
      hsOwner = await this.hubspotService.fetchOwnerById(jobId, deal.properties.hubspot_owner_id as string);
    }

    if (deal?.properties?.call_center_deal_owner) {
      callCenterOwner = await this.hubspotService.fetchOwnerById(jobId, deal.properties.call_center_deal_owner as string);
    }

    if (hsOwner?.email) {
      dealOwnerPartner = await this.odooService.partnerSearch(
        jobId,
        {
          domain: [['email', 'ilike', hsOwner.email]],
          fields: ['id', 'display_name', 'email'],
        },
        'email',
      );
    }

    if (callCenterOwner?.email) {
      callCenterDealOwnerPartner = await this.odooService.partnerSearch(
        jobId,
        {
          domain: [['email', 'ilike', callCenterOwner.email]],
          fields: ['id', 'display_name', 'email'],
        },
        'email',
      );
    }

    return {
      hsOwner,
      callCenterOwner,
      dealOwnerPartner,
      callCenterDealOwnerPartner,
    };
  }

  private async upsertOwnerPartners(
    jobId: string,
    deal: SimplePublicObjectWithAssociations,
  ): Promise<{
    hsOwner: Partial<PublicOwner>;
    callCenterOwner: Partial<PublicOwner>;
    dealOwnerPartnerId?: number;
    callCenterDealOwnerPartnerId?: number;
  }> {
    let hsOwner: Partial<PublicOwner> = {};
    let callCenterOwner: Partial<PublicOwner> = {};

    let dealOwnerPartnerId: number | undefined;
    let callCenterDealOwnerPartnerId: number | undefined;

    if (deal?.properties?.hubspot_owner_id) {
      hsOwner = await this.hubspotService.fetchOwnerById(jobId, deal.properties.hubspot_owner_id as string);
    }

    if (deal?.properties?.call_center_deal_owner) {
      callCenterOwner = await this.hubspotService.fetchOwnerById(jobId, deal.properties.call_center_deal_owner as string);
    }

    if (hsOwner?.email) {
      dealOwnerPartnerId = Number(
        await this.odooService.partnerSyncProcess(jobId, {
          email: hsOwner.email,
          firstname: hsOwner.firstName,
          lastname: hsOwner.lastName,
        }),
      );
    }

    if (callCenterOwner?.email) {
      callCenterDealOwnerPartnerId = Number(
        await this.odooService.partnerSyncProcess(jobId, {
          email: callCenterOwner.email,
          firstname: callCenterOwner.firstName,
          lastname: callCenterOwner.lastName,
        }),
      );
    }

    return {
      hsOwner,
      callCenterOwner,
      dealOwnerPartnerId,
      callCenterDealOwnerPartnerId,
    };
  }

  private async createQuotation(jobId: string, context: string, quote: ValsList): Promise<number[] | void> {
    const salesOrder = quote?.vals_list?.[0] as SalesOrder;
    const orderLines = salesOrder?.order_line;

    if (!orderLines.length) return await this.handleSkip(jobId, context, 'Invalid Line Items Or No Odoo Product Id');

    const quotation = await this.odooService.saleOrderCreation(jobId, quote, 'odoo_quotation_id');

    if (!quotation.length) return await this.handleSkip(jobId, context, 'Odoo Sales Order creation failed ');

    this.logger.verbose(`[${context}] Quotation created`, {
      jobId,
      quotationId: quotation?.[0],
    });

    const confirmStatus = (await this.odooService.saleOrderConformation(
      jobId,
      {
        ids: [quotation?.[0]],
        context: {},
      },
      'state',
    )) as unknown as boolean;

    this.logger.verbose(`Sales order Status : ${confirmStatus}`);
    return quotation;
  }

  private async createHubspotQuote(
    jobId: string,
    context: string,
    dealId: string,
    deal: SimplePublicObjectWithAssociations,
    quotation: number[],
    lineItems: SimplePublicObject[],
    hsOwner: PublicOwner,
  ): Promise<SimplePublicObject | void> {
    const quoteTemplates = (await this.hubspotService.fetchQuoteTemplates(jobId))?.results?.find(
      (v) => v.properties?.hs_type === 'customizable_quote_template' && v.properties?.hs_name === 'Default Original',
    );

    const quoteId = await this.hubspotService.quoteProcess(jobId, dealId, deal.properties, String(quotation?.[0]), lineItems, hsOwner, quoteTemplates?.id);

    if (!quoteId) return await this.handleSkip(jobId, context, 'Quote creation failed');

    const { hs_quote_amount } = (await this.hubspotService.fetchQuote(jobId, quoteId.id))?.properties;

    if (hs_quote_amount) {
      await this.updateDeal(jobId, dealId, {
        amount: hs_quote_amount,
      });
    }

    return quoteId;
  }

  private async handlingServiceClose(jobId: string, deal: SimplePublicObjectWithAssociations, quoteId: string) {
    this.logger.debug(`${this.handlingServiceClose.name} for deal : ${deal.id}`);
    const dealId = deal.id;

    const dealPipeline = deal.properties.pipeline as string;

    const pipelineStageMap = JSON.parse(this.configService.get<string>('HUBSPOT_PIPELINE_ID_TO_STAGE_ID_MAP') || '{}');

    const closedStageId = pipelineStageMap[dealPipeline];

    if (!closedStageId) return await this.handleSkip(jobId, this.handlingServiceClose.name, 'service complete stage id not found for deal pipeline');

    await this.updateDeal(jobId, dealId, { dealstage: closedStageId });

    const { invoices } = await this.hubspotService.getDealDetails(dealId, jobId, [HubspotObjects.INVOICES]);

    const invoice = invoices?.[0]?.id
      ? await this.hubspotService.updateInvoiceById(jobId, invoices?.[0].id, {
          hs_invoice_status: 'paid',
        })
      : null;

    this.logger.verbose(
      invoice
        ? `[Invoice Sync] Successfully updated invoice status to PAID. JobId: ${jobId}, InvoiceId: ${invoices[0].id}`
        : `[Invoice Sync] Invoice update skipped. No associated invoice found. JobId: ${jobId}`,
    );

    return await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
  }

  private async handlingServiceCloseSessions(jobId: string, event: CloseServiceWebhook, deal: SimplePublicObjectWithAssociations) {
    this.logger.debug(`${this.handlingServiceCloseSessions.name} for deal : ${deal.id} and event : ${event?.order_id}`);

    const completedSession = Number(event.sessions_completed);

    if (!completedSession || completedSession < 1 || completedSession > 15) {
      this.logger.warn(`Invalid session count: ${completedSession}`);
      return await this.handleSkip(jobId, this.handlingServiceCloseSessions.name, `Invalid session count: ${completedSession}`);
    }

    const dateProperty = `prp_session_${completedSession}_date`;
    const statusProperty = `prp_session_${completedSession}_status`;

    const properties = {
      [dateProperty]: event.timestamp ? toHubspotDateValue(event.timestamp) : undefined,
      [statusProperty]: 'Completed',
    };

    await this.updateDeal(jobId, deal.id, {
      ...properties,
    });

    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
  }

  public async handlingCloseService(jobId: string, event: CloseServiceWebhook) {
    this.logger.debug(`${this.handlingCloseService.name} for event : ${event?.order_id}`);

    const context = this.handlingCloseService.name;

    const salesOrderId = event?.order_id;

    if (!salesOrderId) return await this.handleSkip(jobId, context, `Order id not found : ${salesOrderId}`);

    const quoteId = await this.hubspotService.fetchQuoteByOdooQuoteId(jobId, salesOrderId?.toString());

    if (!quoteId) return await this.handleSkip(jobId, context, `Sales order id : ${salesOrderId} Quote Not Found`);

    const dealId = await this.hubspotService.fetchAssociatedDealIdByQuoteId(quoteId as string, jobId);

    if (!dealId) return await this.handleSkip(jobId, context, `Sales order id : ${salesOrderId} Deal Not Associated / Not Found`);

    const deal = await this.getDeal(jobId, dealId);

    if (!deal) return await this.handleSkip(jobId, context, `Sales order id : ${salesOrderId} Deal Not Found`);

    if (event.is_closed) return await this.handlingServiceClose(jobId, deal, quoteId);

    await this.handlingServiceCloseSessions(jobId, event, deal);

    return await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
  }

  public async handlingContactProcess(jobId: string, event: HubspotWebhookDto) {
    this.logger.debug(`${this.handlingContactProcess.name} : ${jobId}`);
    const recordId = event?.objectId?.toString() as string;
    const contact = await this.hubspotService.fetchContact(recordId, jobId);
    await this.odooUpsertContactProcess(jobId, contact);
    return await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
  }

  public async fileUploadProcess(jobId: string, event: HubspotWebhookDto) {
    this.logger.debug(`${this.fileUploadProcess.name}`);

    // Path for folder structure (without .pdf)
    const folderPath = `sales_orders/${event.objectId}/${event.propertyValue}`;

    // Get file from Odoo
    const buffer = await this.odooService.getFileBySalesOrderId(jobId, event.propertyValue as string, 'id');

    // Get deal details
    const { deal } = await this.hubspotService.getDealDetails(String(event.objectId), jobId);

    const { dealname } = deal.properties;

    const payload: HttpFile = {
      data: buffer.toString('base64'),
      name: `${dealname}.pdf`,
    };

    // Upload file using the fixed method
    const uploadedFile = await this.hubspotService.fileUpload(
      jobId,
      payload,
      undefined, // folderId
      folderPath, // folderPath (without .pdf)
      `${dealname}.pdf`, // fileName
      undefined, // charsetHunch
      JSON.stringify({
        access: 'PRIVATE',
        // Optional: add other options like duplicateValidation
        duplicateValidation: 'REPLACE', // or 'SKIP', 'ERROR'
      }),
    );

    // Create note with attachment
    const note: SimplePublicObjectInputForCreate = {
      properties: {
        hs_note_body: `Sales Order document uploaded: ${dealname}.pdf`,
        hs_timestamp: String(toHubspotDateValue(new Date())),
        hs_attachment_ids: uploadedFile?.id,
      },
      associations: [
        {
          to: {
            id: deal.id,
          },
          types: [
            {
              associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined,
              associationTypeId: 214,
            },
          ],
        },
      ],
    };

    await this.hubspotService.createNote(jobId, note);
    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
    return;
  }
}
