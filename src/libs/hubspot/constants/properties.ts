export const HUBSPOT_OBJECT_PROPERTIES: Record<string, string[]> = {
  contacts: ['firstname', 'lastname', 'email', 'phone', 'company', 'jobtitle', 'lifecyclestage', 'createdate', 'hs_object_id', 'odoo_contact_id'],

  companies: ['name', 'domain', 'industry', 'phone', 'city', 'state', 'country', 'website', 'createdate', 'hs_object_id'],

  deals: [
    'dealname',
    'amount',
    'dealstage',
    'pipeline',
    'closedate',
    'createdate',
    'hs_object_id',
    'hubspot_owner_id',
    'quotation_flow', // custom
    'odoo_invoice_id', // custom
    'odoo_last_payment_date', // custom
    'odoo_payment_amount', // custom
    'payment_method', // custom
    'total_amount_paid', // custom
    'line_items_created', // custom
    'sessions_completed', // custom
    'number_of_sessions', // custom
    'service_type', // custom
    'treatment_category', // custom
    'hs_mrr', // native
    'hubspot_owner_id', // native
    'call_center_deal_owner', // custom
    'number_of_hairs___cloned_', // custom
    'discount_amount', // custom
    'number_of_hairs', // custom
    'service_type', // custom
  ],

  line_items: ['name', 'quantity', 'price', 'amount', 'hs_product_id', 'createdate', 'hs_object_id', 'odoo_product_id'],

  products: ['name', 'description', 'price', 'hs_sku', 'hs_cost_of_goods_sold', 'createdate', 'hs_object_id', 'odoo_product_id'],

  tickets: ['subject', 'content', 'hs_ticket_priority', 'hs_pipeline', 'hs_pipeline_stage', 'createdate', 'hs_object_id'],

  quotes: [
    'hs_title',
    'hs_expiration_date',
    'hs_status',
    'hs_template_type',
    'hs_total_amount',
    'createdate',
    'hs_object_id',
    'hs_quote_amount',
    'odoo_quotation_id', // custom
    'odoo_invoice_id', // custom
  ],

  invoices: [
    'hs_title',
    'hs_object_id',
    'hs_status',
    'hs_createdate',
    'hs_lastmodifieddate',
    'hs_published_at',

    'hs_total_amount',
    'hs_subtotal',
    'hs_tax_amount',
    'hs_discount_amount',
    'hs_currency',
    'hs_taxes_total',
    'hs_quote_link',
    'hs_pdf_download_link',
    'hs_tax_id',

    'hs_payment_status',
    'hs_payment_link',
    'hs_payment_due_date',

    'hubspot_owner_id',
    'hs_invoice_date',
    'hs_invoice_name',
    'hs_invoice_amount',
    'hs_invoice_status',
    'hs_invoice_date',

    'odoo_invoice_id', // custom
    'odoo_quotation_id', // custom
  ],

  owners: ['hs_given_name', 'hs_family_name', 'hs_email'],

  quote_template: ['hs_name, hs_type'],
};
