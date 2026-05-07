export type OdooWebhookEventName =
  | 'quotation_status_update'
  | 'invoice_created'
  | 'payment_created'
  | 'refund_credit_note'
  | 'payment_link_tabi_tamara'
  | 'product_create'
  | 'product_update';

export const ODOO_WEBHOOK_EVENT_NAMES: OdooWebhookEventName[] = [
  'quotation_status_update',
  'invoice_created',
  'payment_created',
  'payment_link_tabi_tamara',
  'product_create',
  'product_update',
] as const;

export function isValidOdooEventName(eventName: string): eventName is OdooWebhookEventName {
  return ODOO_WEBHOOK_EVENT_NAMES.includes(eventName as OdooWebhookEventName);
}

export const ODOO_WEBHOOK_EVENT_SET = new Set<OdooWebhookEventName>(ODOO_WEBHOOK_EVENT_NAMES);

export const ODOO_WEBHOOK_EVENT_LABELS: Record<OdooWebhookEventName, string> = {
  quotation_status_update: 'Quotation Status Update',
  invoice_created: 'Invoice Created',
  payment_created: 'Payment Created',
  refund_credit_note: 'Refund / Credit Note',
  payment_link_tabi_tamara: 'Payment Link (Tabi/Tamara)',
  product_create: 'Product Created',
  product_update: 'Product Updated',
};

export const ODOO_WEBHOOK_EVENT_GROUPS = {
  quotation: ['quotation_status_update'] as OdooWebhookEventName[],
  invoice: ['invoice_created', 'refund_credit_note'] as OdooWebhookEventName[],
  payment: ['payment_created', 'payment_link_tabi_tamara'] as OdooWebhookEventName[],
  product: ['product_create', 'product_update'] as OdooWebhookEventName[],
} as const;

export interface OdooQuotationStatusWebhook {
  currency: string;
  date_order: string;
  event_type: 'quotation_status_update';
  quotation_reference: string;
  previous_status: 'draft' | 'sent' | 'sale' | 'cancel';
  new_status: 'draft' | 'sent' | 'sale' | 'cancel';
  partner_id: number;
  partner_name: string;
  partner_email: string;
  total_amount: number;
  timestamp: string;
  lines: OdooQuotationLine[];
}

export interface OdooQuotationLine {
  default_code: string;
  price_subtotal: number;
  price_unit: number;
  product_id: number;
  product_name: string;
  quantity: number;
}

export interface OdooInvoiceCreatedWebhook {
  currency: string;
  due_date: string;
  invoice_date: string;
  timestamp: string;
  event_type: 'invoice_created';
  invoice_reference: string;
  move_type: 'out_invoice';
  state: 'draft' | 'posted' | 'cancel';
  payment_state: 'not_paid' | 'in_payment' | 'paid' | 'partial' | 'reversed';
  partner_id: number;
  partner_name: string;
  partner_email: string;
  untaxed_amount: number;
  tax_amount: number;
  residual_amount: number;
  total_amount: number;
  lines: OdooInvoiceLine[];
}

export interface OdooInvoiceLine {
  default_code: string;
  product_id: number;
  product_name: string;
  quantity: number;
  price_unit: number;
  price_subtotal: number;
}
