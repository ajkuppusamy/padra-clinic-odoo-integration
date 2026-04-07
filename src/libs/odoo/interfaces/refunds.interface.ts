import { BaseResponse, ISO8601Date, ISO4217Currency, LineItem } from './base.interface';
import { RefundMethod } from '../enums';

export interface RefundLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface CreateRefundRequest {
  invoice_id: string;
  refund_date: ISO8601Date;
  reason: string;
  refund_method?: RefundMethod;
  line_items?: LineItem[];
}

export interface CreateRefundResponse extends BaseResponse {
  refund_id: string;
  refund_state: 'posted' | 'draft' | 'cancel';
  refund_date: ISO8601Date;
  refund_amount: number;
  amount_residual: number;
  currency: ISO4217Currency;
  reason: string;
  original_invoice_id: string;
  original_invoice_reference: string;
  contact_id: string;
  line_items: RefundLineItem[];
}

export interface GetRefundResponse extends BaseResponse {
  refund_id: string;
  refund_state: 'posted' | 'draft' | 'cancel';
  refund_date: ISO8601Date;
  refund_amount: number;
  amount_residual: number;
  currency: ISO4217Currency;
  reason: string;
  original_invoice_id: string;
  original_invoice_reference: string;
  contact_id: string;
  line_items: RefundLineItem[];
}

export interface ListRefundsResponse extends BaseResponse {
  invoice_id: string;
  total_refunds: number;
  total_refunded_amount: number;
  currency: ISO4217Currency;
  refunds: Array<{
    refund_id: string;
    refund_state: 'posted' | 'draft' | 'cancel';
    refund_date: ISO8601Date;
    refund_amount: number;
    reason: string;
    contact_id: string;
    line_items: RefundLineItem[];
  }>;
}
