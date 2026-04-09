import { CreateProductRequest, CreateProductResponse, UpdateProductResponse } from '@libs/odoo/interfaces';

export type SourceType = 'odoo_ui' | 'api';
export type QuotationStatus = 'draft' | 'confirmed' | 'done' | 'cancel';
export type PaymentStatus = 'not_paid' | 'partial' | 'paid';
export type PaymentMethodType = 'tabi' | 'tamara' | 'cash' | 'bank_transfer' | 'credit_card';

export interface QuotationStatusUpdateEvent {
  event: 'quotation_status_update';
  quotation_id: string;
  quotation_reference: string;
  contact_id: string;
  previous_status: QuotationStatus;
  new_status: QuotationStatus;
  total_amount: number;
  currency: string;
  source: SourceType;
  timestamp?: string; // ISO 8601
}

export interface InvoiceCreatedEvent {
  event: 'invoice_created';
  invoice_id: string;
  invoice_reference: string;
  contact_id: string;
  quotation_id: string | null;
  total_amount: number;
  currency: string;
  invoice_date: string; // YYYY-MM-DD
  due_date: string; // YYYY-MM-DD
  payment_status: PaymentStatus;
  source: SourceType;
  timestamp?: string; // ISO 8601
}

export interface PaymentCreatedEvent {
  event: 'payment_created';
  invoice_id: string;
  contact_id: string;
  transaction_id: string;
  payment_method: PaymentMethodType;
  amount_paid: number;
  currency: string;
  payment_date: string; // YYYY-MM-DD
  source: SourceType;
  timestamp?: string; // ISO 8601
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
