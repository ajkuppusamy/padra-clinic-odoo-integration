import { CreateProductRequest, CreateProductResponse, UpdateProductResponse } from '@libs/odoo/interfaces';

export type SourceType = 'odoo_ui' | 'api';
export type QuotationStatus = 'draft' | 'confirmed' | 'done' | 'cancel';
export type PaymentStatus = 'not_paid' | 'partial' | 'paid';
export type PaymentMethodType = 'tabi' | 'tamara' | 'cash' | 'bank_transfer' | 'credit_card';

export interface QuotationLineItem {
  product_id: number;
  product_name: string;
  default_code: string;
  quantity: number;
  price_unit: number;
  price_subtotal: number;
}

export interface QuotationStatusUpdateEvent {
  // Old payload
  event?: 'quotation_status_update';
  quotation_id?: string;
  contact_id?: string;
  source?: SourceType;

  // New payload
  event_type?: 'quotation_status_update';
  order_id?: number;
  partner_id?: number;
  partner_name?: string;
  partner_email?: string;
  date_order?: string;
  lines?: QuotationLineItem[];

  // Common fields
  quotation_reference: string;
  previous_status: QuotationStatus;
  new_status: QuotationStatus;
  total_amount: number;
  currency: string;
  timestamp?: string; // ISO 8601
}
export interface InvoiceCreatedEvent {
  event: 'invoice_created';

  // core stable fields (used by both old & new)
  currency: string;
  invoice_date: string;
  due_date: string;
  invoice_reference: string;
  total_amount: number;
  timestamp?: string;

  // old payload support
  invoice_id: string;
  contact_id?: string;
  quotation_id: string | null;
  payment_status?: PaymentStatus;
  source?: SourceType;

  // new payload support (all optional)
  event_type?: string;
  move_id?: number;
  move_type?: string;
  partner_id?: number;
  partner_name?: string;
  partner_email?: string;
  order_id: string | null;

  payment_state?: string;
  residual_amount?: number;
  state?: string;

  tax_amount?: number;
  untaxed_amount?: number;

  lines?: Array<{
    default_code: string;
    price_subtotal: number;
    price_unit: number;
    product_id: number;
    product_name: string;
    quantity: number;
  }>;

  // future-proof (VERY important for no-break guarantee)
  [key: string]: any;
}

export interface PaymentCreatedEvent {
  // common
  event: 'payment_created';
  currency: string;
  payment_date: string;
  timestamp?: string;

  // new webhook fields
  amount?: number;
  event_type?: string;
  journal?: string;
  memo?: string;
  partner_id?: number;
  partner_name?: string;
  partner_type?: string;
  payment_id?: number;
  payment_reference?: string;
  payment_type?: 'inbound' | 'outbound';
  reconciled_invoices?: {
    invoice_reference: string;
    payment_state: string;
    residual_amount: number;
    total_amount: number;
  }[];
  state?: string;

  // old webhook fields
  invoice_id?: number;
  contact_id?: string;
  transaction_id?: string;
  payment_method?: PaymentMethodType;
  amount_paid?: number;
  source?: SourceType;
}

export interface RefundCreditNoteEvent {
  event: 'refund_credit_note';
  refund_id: string;
  refund_date: string; // YYYY-MM-DD
  refund_amount: number;
  currency: string;
  reason: string;
  original_invoice_id: string;
  contact_id: string;
  source: SourceType;
  timestamp?: string; // ISO 8601
}

export interface PaymentLinkTabiTamaraEvent {
  event: 'payment_link_tabi_tamara';
  invoice_id: string;
  contact_id: string;
  payment_method: 'tabi' | 'tamara';
  payment_link_url: string | null;
  amount: number;
  currency: string;
  timestamp?: string; // ISO 8601
}

export interface ProductCreateEvent extends CreateProductRequest, CreateProductResponse, UpdateProductResponse {
  event: 'product_create';
}

export interface ProductUpdateEvent extends CreateProductRequest, CreateProductResponse, UpdateProductResponse {
  event: 'product_update';
}

export type OdooWebhookEvent =
  | QuotationStatusUpdateEvent
  | InvoiceCreatedEvent
  | PaymentCreatedEvent
  | RefundCreditNoteEvent
  | PaymentLinkTabiTamaraEvent
  | ProductCreateEvent
  | ProductUpdateEvent;
