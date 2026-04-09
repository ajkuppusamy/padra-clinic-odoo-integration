import { QueueStatus } from '@common/entities';
import { QueueRepository } from '@common/repositories';
import { SimplePublicObject } from '@hubspot/api-client/lib/codegen/crm/companies';
import { QuotationFlowType } from '@modules/hubspot/dto/quotation-flow.dto';
import { HubspotService } from '@modules/hubspot/hubspot.service';
import { ProductCreateEvent, ProductUpdateEvent } from '@modules/odoo/interfaces/event.interfaces';
import { OdooService } from '@modules/odoo/odoo.service';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(
    private readonly queueRepository: QueueRepository,
    private readonly hubspotService: HubspotService,
    private readonly odooService: OdooService,
  ) {}

  /**
   * Extract quoteId from queue payload
   */
  private async extractQuoteId(jobId: string): Promise<string | null> {
    try {
      const job = await this.queueRepository.findByJobId(jobId);
      let payload = job?.payload;

      if (typeof payload === 'string') {
        payload = JSON.parse(payload);
      }

      return payload?.quoteId ?? null;
    } catch (error) {
      this.logger.error(`[extractQuoteId] Failed to parse payload`, {
        jobId,
        error: error?.['message'],
      });
      return null;
    }
  }

  /**
   * Main execution flow
   */
  async dealExecutionProcess(dealId: string, jobId: string) {
    const context = 'dealExecutionProcess';

    this.logger.log(`[${context}] Started`, { jobId, dealId });

    try {
      const dealsMetaData = await this.hubspotService.getDealDetails(dealId, jobId);

      const contacts = dealsMetaData?.contacts ?? [];
      const lineItems = dealsMetaData?.lineItems ?? [];
      const quotes = dealsMetaData?.quotes ?? [];

      this.logger.log(`[${context}] Deal data fetched`, {
        jobId,
        contactsCount: contacts.length,
        lineItemsCount: lineItems.length,
        quotesCount: quotes.length,
      });

      const odooContactId = await this.processContacts(contacts, jobId);

      if (!odooContactId) {
        await this.handleSkip(jobId, context, 'No associated contact found');
      }

      const isOffline = dealsMetaData?.deal?.properties?.quotation_flow === QuotationFlowType.OFFLINE;

      const lineitemProperties = lineItems.map((i) => i?.properties);

      const quotation = await this.odooService.processQuotation(jobId, odooContactId!, lineitemProperties);

      this.logger.log(`[${context}] Quotation created`, {
        jobId,
        quotationId: quotation?.quotation_id,
      });

      const quoteId = (await this.extractQuoteId(jobId)) || (quotes.length === 1 ? quotes[0]?.id : null);

      if (!quoteId) {
        throw new Error('No quoteId found');
      }

      if (isOffline) {
        await this.handleOfflineFlow(jobId, quoteId, quotation);
      } else {
        await this.handleOnlineFlow(jobId, quoteId, quotation);
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

      throw error;
    }
  }

  /**
   * Process contacts and return first Odoo contactId
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
   * Handle offline quotation flow
   */
  private async handleOfflineFlow(jobId: string, quoteId: string, quotation: any) {
    this.logger.log(`[handleOfflineFlow] Updating HubSpot quote (offline)`, {
      jobId,
      quoteId,
      quotationId: quotation?.quotation_id,
    });

    await this.hubspotService.updateQuoteById(jobId, quoteId, {
      odoo_quotation_id: quotation.quotation_id,
    });
  }

  /**
   * Handle online quotation → invoice flow
   */
  private async handleOnlineFlow(jobId: string, quoteId: string, quotation: any) {
    this.logger.log(`[handleOnlineFlow] Converting quotation to invoice`, {
      jobId,
      quotationId: quotation?.quotation_id,
    });

    const invoice = await this.odooService.ProcessQuotationtoInvoice(jobId, quotation.quotation_id);

    this.logger.log(`[handleOnlineFlow] Invoice created`, {
      jobId,
      invoiceId: invoice?.invoice_id,
    });

    await this.hubspotService.updateQuoteById(jobId, quoteId, {
      odoo_invoice_id: invoice.invoice_id,
      odoo_quotation_id: invoice.quotation_id,
    });
  }

  /**
   * Handle skip scenario
   */
  private async handleSkip(jobId: string, context: string, reason: string) {
    this.logger.warn(`[${context}] Skipped`, { jobId, reason });

    await this.queueRepository.updateStatus(jobId, QueueStatus.SKIPPED);

    throw new Error(reason);
  }

  public async handlingProductProcess(jobId: string, properties: ProductCreateEvent | ProductUpdateEvent, odooEvent: string) {
    if (!properties.product_id) return await this.handleSkip(jobId, this.handlingProductProcess.name, 'Odoo Product Id Not Found');
    const product = await this.hubspotService.processProducts(jobId, properties, odooEvent);
    this.logger.debug(`HubSpot Product${JSON.stringify(product)}`);
    await this.queueRepository.updateStatus(jobId, QueueStatus.COMPLETED);
  }
}
