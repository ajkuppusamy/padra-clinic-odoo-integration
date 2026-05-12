export interface BaseSearch {
  id: number;
  display_name: string;
  email: string;
  [key: string]: any;
}

export interface ContactSearchResponse extends BaseSearch {}

export interface CompanySearchResponse extends BaseSearch {}

export interface SearchReadParams {
  domain?: Array<[string, string, string | number | boolean | null | any]>;
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
  vals_list: SalesOrder[] | Contact[] | Invoice[];
}

export interface Contact {
  autopost_bills?: string;
  name?: string;
  email: string;
  street?: string;
  city?: string;
  zip?: string;
  company_id: string;
}

export interface SalesOrder {
  partner_id: number;
  date_order: string;
  company_id: number;
  partner_shipping_id: number;
  partner_invoice_id: number;
  warehouse_id?: number;
  order_line: [number, number, OrderLine][];
}

export interface OrderLine {
  product_id: number;
  name: string;
  price_unit: number;
  product_uom_qty: number;
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
