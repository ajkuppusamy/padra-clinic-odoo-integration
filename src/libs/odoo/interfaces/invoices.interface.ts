import { BaseResponse, ISO8601Date, ISO4217Currency, LineItem, LineItemWithSubtotal, PaymentEndpoint } from './base.interface';
import { PaymentStatus } from '../enums';

export type PaymentType = 'direct_payment';

export interface CreateInvoiceRequest {
  contact_id: string;
  invoice_date: ISO8601Date;
  due_date: ISO8601Date;
  payment_type: PaymentType;
  line_items: LineItem[];
  quotation_id?: string;
}

export interface CreateInvoiceResponse extends BaseResponse {
  invoice_id: string;
  invoice_reference: string;
  contact_id: string;
  payment_status: PaymentStatus;
  total_amount: number;
  currency: ISO4217Currency;
  invoice_date: ISO8601Date;
  due_date: ISO8601Date;
  payment_endpoints: {
    online_Tabi_Tamara: PaymentEndpoint;
    offline_card: PaymentEndpoint;
    cash_payment: PaymentEndpoint;
  };
}

export interface UpdateInvoiceRequest {
  invoice_date?: ISO8601Date;
  due_date?: ISO8601Date;
  line_items?: LineItem[];
}

export interface UpdateInvoiceResponse extends BaseResponse {
  message: string;
}

export interface GetInvoiceResponse extends BaseResponse {
  invoice: {
    invoice_id: string;
    invoice_reference: string;
    contact_id: string;
    quotation_id?: string;
    payment_status: PaymentStatus;
    total_amount: number;
    currency: ISO4217Currency;
    invoice_date: ISO8601Date;
    due_date: ISO8601Date;
    line_items: LineItemWithSubtotal[];
  };
}

export interface DownloadInvoiceLinkResponse {
  download_url: string;
}
