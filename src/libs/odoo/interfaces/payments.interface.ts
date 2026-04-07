import { BaseResponse, ISO8601Date, ISO8601DateTime, ISO4217Currency } from './base.interface';

export interface TabiTamaraPaymentRequest {
  invoice_id: string;
  amount: number;
  currency: ISO4217Currency;
  gateway_reference: string;
  payment_link_url?: string;
}

export interface OfflineCardPaymentRequest {
  invoice_id: string;
  amount: number;
  card_reference: string;
  transaction_reference: string;
}

export interface CashPaymentRequest {
  invoice_id: string;
  amount: number;
  received_date: ISO8601Date;
  notes?: string;
}

export interface PaymentResponse extends BaseResponse {
  transaction_id: string;
  payment_status: 'completed' | 'fully_paid';
  amount_paid?: number;
  amount_received?: number;
  amount_applied?: number;
  amount_due?: number;
  timestamp: ISO8601DateTime;
}

export interface GetPaymentStatusResponse {
  invoice_id: string;
  payment_status: 'unpaid' | 'paid' | 'fully_paid' | 'in_payment';
  amount_paid: number;
  amount_due: number;
  last_payment_date?: ISO8601Date;
  last_payment_method?: string;
}
