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

export interface SaleOrderLineUpdateWebhook {
  created_lines: CreatedLine[];
  event_type: 'sale_order_line_update';
  sale_order: SaleOrder;
  timestamp: string;
  total_lines_created: number;
  total_lines_updated: number;
  updated_lines: UpdatedLine[];
}

export interface SaleOrder {
  currency: string;
  date_order: string;
  order_id: number;
  order_name: string;
  partner_id: number;
  partner_name: string;
  state: string;
}

export interface CreatedLine {
  currency: string;
  default_code: string;
  description: string;
  discount: number;
  line_id: number;
  order_id: number;
  order_name: string;
  price_subtotal: number;
  price_total: number;
  price_unit: number;
  product_id: number;
  product_name: string;
  qty_delivered: number;
  qty_invoiced: number;
  quantity: number;
  sequence: number;
  state: string;
  taxes: Tax[];
  uom_id: number;
  uom_name: string;
}

export interface UpdatedLine {
  changed_fields: ChangedFields;
  default_code: string;
  line_id: number;
  product_id: number;
  product_name: string;
}

export interface ChangedFields {
  quantity?: ChangedValue<number>;
  price_subtotal?: ChangedValue<number>;
  price_total?: ChangedValue<number>;
  price_unit?: ChangedValue<number>;
  discount?: ChangedValue<number>;
}

export interface ChangedValue<T> {
  old: T;
  new: T;
}

export interface Tax {
  id?: number;
  name?: string;
  amount?: number;
}

export type WebhookPayload =
  | QuotationStatusUpdateWebhook
  | InvoiceCreatedWebhook
  | PaymentCreatedWebhook
  | RefundCreditNoteWebhook
  | PaymentLinkTabiTamaraWebhook
  | SaleOrderLineUpdateWebhook;

export interface ListWebhooksResponse extends BaseResponse {
  webhooks: Array<{
    event_type: WebhookEventType;
    configured: boolean;
  }>;
}
