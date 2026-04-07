import { BaseResponse, ISO8601Date, LineItem, ISO4217Currency } from './base.interface';

export interface CreateQuotationRequest {
  contact_id: string;
  quotation_date: ISO8601Date;
  validity_period?: number;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    product_id?: string;
    tax_rate?: number;
  }>;
}

export interface CreateQuotationResponse extends BaseResponse {
  quotation_id: string;
  quotation_reference: string;
  total_amount: number;
  currency: ISO4217Currency;
  message: string;
}

export interface UpdateQuotationRequest {
  quotation_date?: ISO8601Date;
  validity_period?: number;
  line_items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    product_id?: string;
    tax_rate?: number;
  }>;
}

export interface ConvertQuotationResponse extends BaseResponse {
  invoice_id: string;
  quotation_id: string;
  message: string;
}
