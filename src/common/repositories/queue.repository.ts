import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, LessThan } from 'typeorm';
import { BaseRepository } from '@common/repositories';
import { Queue, QueueStatus, QueueType } from '@common/entities';

@Injectable()
export class QueueRepository extends BaseRepository<Queue> {
  constructor(@InjectEntityManager() em: EntityManager) {
    super(em, Queue);
  }

  create(entity: Partial<Queue>) {
    return this.getRepo().create(entity);
  }

  async saveQueueItem(queue: Queue): Promise<Queue> {
    return this.persistAndFlush(queue);
  }

  async findByJobId(jobId: string): Promise<Queue | null> {
    return this.getRepo().findOne({
      where: { jobId },
    });
  }

  async updateStatus(jobId: string, status: QueueStatus, error?: string, message?: string): Promise<void> {
    await this.getRepo().update(
      { jobId },
      {
        status,
        ...(message && { message }),
        ...(error && { error }),
        ...(status === QueueStatus.COMPLETED || status === QueueStatus.FAILED ? { processedAt: new Date() } : {}),
      },
    );
  }

  async incrementAttempts(jobId: string): Promise<void> {
    await this.getRepo()
      .createQueryBuilder()
      .update(Queue)
      .set({ attempts: () => 'attempts + 1' })
      .where('job_id = :jobId', { jobId })
      .execute();
  }

  async getPendingQueuedItems(limit: number = 100): Promise<Queue[]> {
    return this.getRepo().find({
      where: { status: QueueStatus.QUEUED },
      order: { priority: 'DESC', createdAt: 'ASC' },
      take: limit,
    });
  }

  async getFailedRetryableItems(maxAttempts: number = 3): Promise<Queue[]> {
    return this.getRepo()
      .createQueryBuilder('queue')
      .where('queue.status = :status', { status: QueueStatus.FAILED })
      .andWhere('queue.attempts < :maxAttempts', { maxAttempts })
      .orderBy('queue.priority', 'DESC')
      .addOrderBy('queue.createdAt', 'ASC')
      .getMany();
  }

  async getStuckProcessingItems(timeoutMinutes: number = 30): Promise<Queue[]> {
    const timeoutDate = new Date();
    timeoutDate.setMinutes(timeoutDate.getMinutes() - timeoutMinutes);

    return this.getRepo().find({
      where: {
        status: QueueStatus.PROCESSING,
        updatedAt: LessThan(timeoutDate),
      },
    });
  }

  async getItemsByType(queueType: QueueType, limit: number = 100): Promise<Queue[]> {
    return this.getRepo().find({
      where: { queueType, status: QueueStatus.QUEUED },
      order: { priority: 'DESC', createdAt: 'ASC' },
      take: limit,
    });
  }

  async getStats(): Promise<any> {
    const stats = await this.getRepo().createQueryBuilder('queue').select('queue.status', 'status').addSelect('COUNT(*)', 'count').groupBy('queue.status').getRawMany();

    return stats;
  }

  async bulkUpdateStatus(jobIds: string[], status: QueueStatus): Promise<void> {
    await this.getRepo().createQueryBuilder().update(Queue).set({ status, processedAt: new Date() }).where('job_id IN (:...jobIds)', { jobIds }).execute();
  }
}
