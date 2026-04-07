export type ISO8601Date = string; // "2026-04-01"
export type ISO8601DateTime = string; // "2026-04-01T10:00:00+05:30"
export type ISO4217Currency = string; // "AED", "USD", etc.
export type ISO3166Country = string; // "AE", "IN", "AU"

export interface BaseResponse {
  status: 'success' | 'error';
}

export interface ErrorResponse extends BaseResponse {
  status: 'error';
  error_code: string;
  error_message: string;
  timestamp: ISO8601DateTime;
}

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  product_id?: string;
  tax_rate?: number;
}

export interface LineItemWithSubtotal extends LineItem {
  subtotal: number;
}

export interface PaymentEndpoint {
  url: string;
  method: 'POST';
}

export interface OdooConfig {
  baseURL: string;
  apiKey: string;
  companyId?: string;
  timeout?: number;
  isGlobal?: boolean;
  webhookSecret?: string;
  maxConcurrent: number;
  intervalMs: number;
  retryAttempts: number;
  retryDelay: number;
}
