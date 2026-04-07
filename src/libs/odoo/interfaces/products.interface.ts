import { BaseResponse, ISO4217Currency } from './base.interface';
import { ProductType } from '../enums';

export interface CreateProductRequest {
  product_id: string;
  name: string;
  price: number;
  description?: string;
  type?: ProductType;
  uom?: string;
  category?: string;
}

export interface CreateProductResponse extends BaseResponse {
  product_id: string;
  name: string;
  message: string;
}

export interface UpdateProductRequest {
  name?: string;
  price?: number;
  description?: string;
  type?: ProductType;
  uom?: string;
  category?: string;
  active?: boolean;
}

export interface UpdateProductResponse extends BaseResponse {
  product_id: string;
  message: string;
}

export interface GetProductResponse extends BaseResponse {
  product: {
    product_id: string;
    name: string;
    description: string;
    price: number;
    currency: ISO4217Currency;
    uom: string;
    active: boolean;
  };
}
