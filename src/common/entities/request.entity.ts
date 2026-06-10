import { Entity, Column, Index } from 'typeorm';
import { BaseModel } from './base.entity';
import { SourceType } from './queue.entity';

export enum RequestType {
  CREATE_QUOTATION = 'create_quotation',
  UPDATE_QUOTE = 'update_quote',
  UPDATE_CONTACT = 'update_contact',
  CREATE_CONTACT = 'create_contact',
  CREATE_INVOICE = 'create_invoice',
  UPDATE_DEAL = 'update_deal',
  FETCH_DEAL = 'fetch_deal',
  FETCH_CONTACT = 'fetch_contact',
  FETCH_LINEITEM = 'fetch_lineItem',
  FETCH_PRODUCT = 'fetch_product',
  FETCH_QUOTE = 'fetch_quote',
  SEARCH = 'search',
  CREATE_PRODUCT = 'create_product',
  UPDATE_PRODUCT = 'update_product',
  CREATE_QUOTE = 'create_quote',
  CREATE_LINEITEM = 'create_lineitem',
  FETCH_INVOICE = 'fetch_invoice',
  FETCH_OWNER = 'fetch_owner',
  FETCH_QUOTE_TEMPLATE = 'fetch_quote_template',
  UPDATE_INVOICE = 'update_invoice',
  CREATE_DISCOUNT = 'create_discount',
}

export enum RequestStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
}

@Entity('requests')
@Index(['jobId'])
@Index(['externalId'])
@Index(['status', 'createdAt'])
@Index(['requestType'])
export class Request extends BaseModel {
  @Column({ name: 'job_id' })
  jobId!: string;

  @Column({ name: 'request_type', type: 'enum', enum: RequestType })
  requestType!: RequestType;

  @Column({ name: 'external_id', type: 'varchar', length: 255, nullable: true })
  externalId!: string | null;

  @Column({ name: 'target_system', type: 'varchar', length: 50 })
  targetSystem!: SourceType; // 'hubspot' or 'odoo'

  @Column({ name: 'endpoint', type: 'varchar', length: 500 })
  endpoint!: string;

  @Column({ name: 'method', type: 'varchar', length: 10, default: 'POST' })
  method!: string;

  @Column({ name: 'payload', type: 'jsonb' })
  payload!: any;

  @Column({ name: 'status', type: 'enum', enum: RequestStatus, default: RequestStatus.PENDING })
  status!: RequestStatus;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount!: number;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ name: 'error', type: 'jsonb', nullable: true })
  error: any;
}
