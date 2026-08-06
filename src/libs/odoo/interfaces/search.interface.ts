import { DiscountType } from '../enums';
export interface BaseSearch {
  id: number;
  display_name: string;
  email: string;
  [key: string]: any;
  company_id?: [number, string];
  name?: string;
}

export interface ContactSearchResponse extends BaseSearch {}

export interface CompanySearchResponse extends BaseSearch {}

export interface SearchReadParams {
  domain?: Array<[string, string, string | number | boolean | null | any]> | any[];
  fields?: string[];
  limit?: number;
  offset?: number;
  ids?: number[];
}

export interface SearchSalesOrderWrite {
  ids: number[];
  vals: InvoiceIds;
}

export interface InvoiceIds {
  invoice_ids: number[];
}

export interface ValsList {
  vals_list: SalesOrder[] | Contact[] | Invoice[] | unknown[] | CreateDiscount[] | UserCreateValues[];
}

export interface Contact {
  autopost_bills?: string;
  name?: string;
  email: string;
  street?: string;
  city?: string;
  zip?: string;
  company_id: string;
  phone?: string;
}

export interface SalesOrder {
  partner_id: number;
  date_order: string;
  company_id: number;
  partner_shipping_id: number;
  partner_invoice_id: number;
  warehouse_id?: number;
  order_line: [number, number, OrderLine][];
  state: string;
}

export interface OrderLine {
  product_id: number;
  name: string;
  price_unit: number;
  product_uom_qty: number;
  analytic_distribution?: { [key: string]: number };
}

export interface Invoice {
  move_type: string | 'out_invoice';
  partner_id: number;
  invoice_date: string;
  invoice_line_ids: [number, number, InvoiceLineId][];
}

export interface InvoiceLineId {
  product_id: number;
  name: string;
  quantity: number;
  price_unit: number;
}

export interface QuoteCvtInvoice {
  ids: number[];
  vals: InvoiceIds;
}

export interface InvoiceIds {
  invoice_ids: number[];
}

export interface CreateDiscount {
  sale_order_id: number;
  discount_type?: DiscountType;
  discount_amount?: number | string;
  discount_percentage?: number;
}

export interface UserCreateValues {
  login: string;
  name: string;
  company_ids: number[];
  group_ids: number[][];
}
