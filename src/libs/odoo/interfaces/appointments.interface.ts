import { BaseResponse, ISO8601DateTime } from './base.interface';
import { AppointmentStatus } from '../enums';

export interface CreateAppointmentRequest {
  contact_id: string;
  title: string;
  start_datetime: ISO8601DateTime;
  end_datetime: ISO8601DateTime;
  location?: string;
  notes?: string;
  appointment_id?: string;
}

export interface CreateAppointmentResponse extends BaseResponse {
  appointment_id: string;
  odoo_event_id: number;
  message: string;
}

export interface UpdateAppointmentRequest {
  title?: string;
  start_datetime?: ISO8601DateTime;
  end_datetime?: ISO8601DateTime;
  location?: string;
  notes?: string;
  status?: AppointmentStatus;
  odoo_event_id?: number;
}

export interface UpdateAppointmentResponse extends BaseResponse {
  message: string;
}
