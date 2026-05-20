import { Injectable, Logger } from '@nestjs/common';
import { WebhookAuditDto } from './dto/audit.dto';
import { QueueRepository, RequestRepository, ResponseRepository } from '@common/repositories';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(
    private readonly queueRepository: QueueRepository,
    private readonly requestRepository: RequestRepository,
    private readonly responseRepository: ResponseRepository,
  ) {}

  async webhookAudit(dto: WebhookAuditDto) {
    this.logger.debug(`${this.webhookAudit.name} received dto: ${JSON.stringify(dto)}`);

    const { jobId, externalId, status, queueType, sourceType, event, fromDate, toDate, isRequest = false, isResponse = false, page = 1, limit = 10 } = dto;

    const query = this.queueRepository.createQueryBuilder('queue');

    if (jobId)
      query.andWhere('queue.job_id = :jobId', {
        jobId,
      });

    if (externalId)
      query.andWhere('queue.external_id = :externalId', {
        externalId,
      });

    if (status)
      query.andWhere('queue.status = :status', {
        status,
      });

    if (queueType)
      query.andWhere('queue.queue_type = :queueType', {
        queueType,
      });

    if (sourceType)
      query.andWhere('queue.source_type = :sourceType', {
        sourceType,
      });

    if (event)
      query.andWhere('LOWER(queue.event_type) LIKE LOWER(:event)', {
        event: `%${event}%`,
      });

    if (fromDate)
      query.andWhere('queue.created_at >= :fromDate', {
        fromDate,
      });

    if (toDate)
      query.andWhere('queue.created_at <= :toDate', {
        toDate,
      });

    query
      .distinct(true)
      .orderBy('queue.created_at', 'DESC')
      .addOrderBy('queue.updated_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [queues, total] = await query.getManyAndCount();

    if (!queues.length) {
      return {
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        logs: [],
      };
    }

    const logs = await Promise.all(
      queues.map(async (queue) => {
        const result: any = {
          ...queue,
        };

        if (isRequest) {
          const requests = await this.requestRepository.findByJobId(queue.jobId);

          result.requests = requests?.length ? requests : [];
        }

        if (isResponse) {
          const responses = await this.responseRepository.findByJobId(queue.jobId);

          result.responses = responses?.length ? responses : [];
        }

        return result;
      }),
    );

    return {
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
      logs,
    };
  }
}
