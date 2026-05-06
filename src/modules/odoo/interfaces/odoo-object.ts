export interface BaseObject {
  id: number;
  display_name: string;
  name: string;
  create_date: string;
  [key: string]: any;
}

export interface Product extends BaseObject {}

export interface Contact extends BaseObject {}

export interface Company extends BaseObject {}
