import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, In } from 'typeorm';
import { BaseRepository } from '@common/repositories';
import { Response, ResponseStatus } from '@common/entities';

@Injectable()
export class ResponseRepository extends BaseRepository<Response> {
  constructor(@InjectEntityManager() em: EntityManager) {
    super(em, Response);
  }

  create(entity: Partial<Response>) {
    return this.getRepo().create(entity);
  }

  async saveResponse(response: Response): Promise<Response> {
    return this.persistAndFlush(response);
  }

  async findByRequestId(requestId: string): Promise<Response | null> {
    return this.getRepo().findOne({
      where: { requestId },
    });
  }

  async findByJobId(jobId: string): Promise<Response[]> {
    return this.getRepo().find({
      where: { jobId },
      order: { createdAt: 'ASC' },
    });
  }

  async getResponseSummary(jobId: string): Promise<any> {
    const responses = await this.findByJobId(jobId);

    return {
      total: responses.length,
      success: responses.filter((r) => r.status === ResponseStatus.SUCCESS).length,
      failed: responses.filter((r) => r.status === ResponseStatus.ERROR).length,
      avgDuration: responses.reduce((sum, r) => sum + r.durationMs, 0) / responses.length,
    };
  }

  async findByStatus(status: ResponseStatus, limit: number = 100): Promise<Response[]> {
    return this.getRepo().find({
      where: { status },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  async findByRequestIds(requestIds: string[]): Promise<Response[]> {
    if (!requestIds.length) return [];

    return this.getRepo().find({
      where: {
        requestId: In(requestIds),
      },
      order: { createdAt: 'ASC' },
    });
  }
}
