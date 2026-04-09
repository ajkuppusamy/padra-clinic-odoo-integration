export const HUBSPOT_OBJECT_PROPERTIES: Record<string, string[]> = {
  contacts: ['firstname', 'lastname', 'email', 'phone', 'company', 'jobtitle', 'lifecyclestage', 'createdate', 'hs_object_id'],

  companies: ['name', 'domain', 'industry', 'phone', 'city', 'state', 'country', 'website', 'createdate', 'hs_object_id'],

  deals: ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'createdate', 'hs_object_id', 'quotation_flow'],

  line_items: ['name', 'quantity', 'price', 'amount', 'hs_product_id', 'createdate', 'hs_object_id', 'odoo_product_id'],

  products: ['name', 'description', 'price', 'hs_sku', 'hs_cost_of_goods_sold', 'createdate', 'hs_object_id', 'hs_cost_of_goods_sold', 'odoo_product_id'],

  tickets: ['subject', 'content', 'hs_ticket_priority', 'hs_pipeline', 'hs_pipeline_stage', 'createdate', 'hs_object_id'],

  quotes: ['hs_title', 'hs_expiration_date', 'hs_status', 'hs_total_amount', 'createdate', 'hs_object_id', 'odoo_quotation_id', 'odoo_invoice_id'],
};
