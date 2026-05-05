import { Entity, Column, Index, PrimaryGeneratedColumn } from 'typeorm';
import { BaseModel } from './base.entity';

export enum QueueType {
  WEBHOOK = 'webhook',
  SYNC_JOB = 'sync_job',
  RETRY_JOB = 'retry_job',
  LIST = 'list_data',
}

export enum QueueStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum SourceType {
  HUBSPOT = 'hubspot',
  ODOO = 'odoo',
  INTERNAL = 'internal',
}

export enum Flow {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

@Entity('queue')
@Index(['jobId'])
@Index(['queueType', 'status'])
@Index(['externalId'])
@Index(['status', 'createdAt'])
@Index(['processedAt'])
export class Queue extends BaseModel {
  @PrimaryGeneratedColumn({ name: 'job_id' })
  jobId!: string;

  @Column({ name: 'queue_type', type: 'enum', enum: QueueType })
  queueType!: QueueType;

  @Column({ name: 'source_type', type: 'enum', enum: SourceType })
  sourceType!: SourceType;

  @Column({ name: 'event_type', type: 'varchar', length: 255, nullable: true })
  event!: string | null;

  @Column({ name: 'message', type: 'varchar', length: 255, nullable: true })
  message!: string | null;

  @Column({ name: 'external_id', type: 'varchar', length: 255, nullable: true })
  externalId!: string | null;

  @Column({ name: 'payload', type: 'jsonb' })
  payload: any;

  @Column({ name: 'status', type: 'enum', enum: QueueStatus, default: QueueStatus.QUEUED })
  status!: QueueStatus;

  @Column({ name: 'attempts', type: 'integer', default: 0 })
  attempts!: number;

  @Column({ name: 'max_attempts', type: 'integer', default: 3 })
  maxAttempts!: number;

  @Column({ name: 'error', type: 'text', nullable: true })
  error!: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'priority', type: 'integer', default: 1 })
  priority!: number;

  @Column({ name: 'scheduled_for', type: 'timestamptz', nullable: true })
  scheduledFor!: Date | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata: any; // sqs_message_id, receipt_handle, etc.
}
