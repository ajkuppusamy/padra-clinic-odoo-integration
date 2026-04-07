import { BaseResponse, ISO8601Date, ISO8601DateTime, ISO4217Currency } from './base.interface';
import { WebhookEventType } from '../enums';

export interface WebhookHeaders {
  'Content-Type': 'application/json';
  'X-Odoo-Signature': string;
  'X-Odoo-Event': WebhookEventType;
}

export interface QuotationStatusUpdateWebhook {
  event_type: 'quotation_status_update';
  quotation_id: string;
  quotation_reference: string;
  contact_id: string;
  previous_status: string;
  new_status: string;
  total_amount: number;
  currency: ISO4217Currency;
  source: 'hubspot_api' | 'odoo_native';
  timestamp: ISO8601DateTime;
}

export interface InvoiceCreatedWebhook {
  event_type: 'invoice_created';
  invoice_id: string;
  invoice_reference: string;
  contact_id: string;
  quotation_id?: string;
  total_amount: number;
  currency: ISO4217Currency;
  invoice_date: ISO8601Date;
  due_date: ISO8601Date;
  payment_status: string;
  source: 'hubspot_api' | 'odoo_native';
  timestamp: ISO8601DateTime;
}

export interface PaymentCreatedWebhook {
  event_type: 'payment_created';
  invoice_id: string;
  contact_id: string;
  transaction_id: string;
  payment_method: 'tabi_tamara' | 'offline_card' | 'cash';
  amount_paid: number;
  currency: ISO4217Currency;
  payment_date: ISO8601Date;
  source: 'hubspot_api' | 'odoo_native';
  timestamp: ISO8601DateTime;
}

export interface RefundCreditNoteWebhook {
  event_type: 'refund_credit_note';
  refund_id: string;
  refund_date: ISO8601Date;
  refund_amount: number;
  currency: ISO4217Currency;
  reason: string;
  original_invoice_id: string;
  original_invoice_reference: string;
  contact_id: string;
  source: 'hubspot_api' | 'odoo_native';
  timestamp: ISO8601DateTime;
}

export interface PaymentLinkTabiTamaraWebhook {
  event_type: 'payment_link_tabi_tamara';
  invoice_id: string;
  contact_id: string;
  payment_method: 'tabi_tamara';
  payment_link_url: string;
  amount: number;
  currency: ISO4217Currency;
  timestamp: ISO8601DateTime;
}

export type WebhookPayload = QuotationStatusUpdateWebhook | InvoiceCreatedWebhook | PaymentCreatedWebhook | RefundCreditNoteWebhook | PaymentLinkTabiTamaraWebhook;

export interface ListWebhooksResponse extends BaseResponse {
  webhooks: Array<{
    event_type: WebhookEventType;
    configured: boolean;
  }>;
}
