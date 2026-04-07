import { BaseResponse, ISO3166Country, ISO8601DateTime } from './base.interface';

export interface CreateContactRequest {
  email: string;
  name: string;
  company_name: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: ISO3166Country;
}

export interface CreateContactResponse extends BaseResponse {
  contact_id: string;
  message: string;
}

export interface UpdateContactRequest {
  phone?: string;
  company_name?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: ISO3166Country;
}

export interface GetContactResponse extends BaseResponse {
  contact: {
    contact_id: string;
    email: string;
    name: string;
    phone: string;
    company_name: string;
    address: string;
    city: string;
    state: string;
    postal_code: string;
    country: ISO3166Country;
    created_at: ISO8601DateTime;
  };
}
