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
  'refund_credit_note',
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
