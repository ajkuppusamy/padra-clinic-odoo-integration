export interface ContactSearchResponse {
  id: number;
  display_name: string;
  email: string;
  hubspot_contact_id: string;
}

export interface SearchReadParams {
  domain: Array<[string, string, string | number | boolean | null]>;
  fields: string[];
  limit: number;
}
