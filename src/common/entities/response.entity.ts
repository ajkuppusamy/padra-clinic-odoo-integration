import { Entity, Column, Index } from 'typeorm';
import { BaseModel } from './base.entity';

export enum ResponseStatus {
  SUCCESS = 'success',
  ERROR = 'error',
  TIMEOUT = 'timeout',
}

@Entity('responses')
@Index(['requestId'])
@Index(['jobId'])
@Index(['statusCode'])
@Index(['createdAt'])
export class Response extends BaseModel {
  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @Column({ name: 'job_id' })
  jobId!: string;

  @Column({ name: 'status_code', type: 'integer' })
  statusCode!: number;

  @Column({ name: 'status', type: 'enum', enum: ResponseStatus })
  status!: ResponseStatus;

  @Column({ name: 'data', type: 'jsonb', nullable: true })
  data: any;

  @Column({ name: 'error', type: 'jsonb', nullable: true })
  error!: any;

  @Column({ name: 'duration_ms', type: 'integer' })
  durationMs!: number;

  @Column({ name: 'received_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  receivedAt!: Date;
}
