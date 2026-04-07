import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { BaseRepository } from '@common/repositories';
import { Request, RequestStatus, RequestType } from '@common/entities';

@Injectable()
export class RequestRepository extends BaseRepository<Request> {
  constructor(@InjectEntityManager() em: EntityManager) {
    super(em, Request);
  }

  create(entity: Partial<Request>) {
    return this.getRepo().create(entity);
  }

  async saveRequest(request: Request): Promise<Request> {
    return this.persistAndFlush(request);
  }

  async findByJobId(jobId: string): Promise<Request[]> {
    return this.getRepo().find({
      where: { jobId },
      order: { createdAt: 'ASC' },
    });
  }

  async findByJobIdAndType(jobId: string, requestType: RequestType): Promise<Request | null> {
    return this.getRepo().findOne({
      where: { jobId, requestType },
    });
  }

  async updateStatus(requestId: string, status: RequestStatus, error?: string): Promise<void> {
    await this.getRepo().update(requestId, {
      status,
      ...(error && { error }),
    });
  }

  async incrementRetryCount(requestId: string): Promise<void> {
    await this.getRepo()
      .createQueryBuilder()
      .update(Request)
      .set({ retryCount: () => 'retry_count + 1' })
      .where('id = :id', { id: requestId })
      .execute();
  }

  async findPendingRequests(limit: number = 100): Promise<Request[]> {
    return this.getRepo().find({
      where: { status: RequestStatus.PENDING },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  async findFailedRequests(maxRetryCount: number = 3): Promise<Request[]> {
    return this.getRepo()
      .createQueryBuilder('request')
      .where('request.status = :status', { status: RequestStatus.FAILED })
      .andWhere('request.retry_count < :maxRetry', { maxRetry: maxRetryCount })
      .orderBy('request.createdAt', 'ASC')
      .getMany();
  }
}
