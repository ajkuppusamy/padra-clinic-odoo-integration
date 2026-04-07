import { Injectable, Logger } from '@nestjs/common';
import { HubspotService as HubspotLibService } from '@libs/hubspot/hubspot.service';
import { AwsSqsProducerService } from '@libs/aws_sqs/producer.service';
import { QuotationFlow } from './dto/quotation-flow.dto';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { QueueRepository } from '@common/repositories';
import { QueueStatus, QueueType, Flow, SourceType } from '@common/entities';

@Injectable()
export class HubspotService {
  private readonly logger = new Logger(HubspotService.name);

  constructor(
    private readonly sqsProducerService: AwsSqsProducerService,
    private readonly configService: ConfigService,
    private readonly queueRepository: QueueRepository,
  ) {}

  async sendQuotationFlow(data: QuotationFlow) {
    this.logger.debug(`${this.sendQuotationFlow.name}`);
    const sqsUrl = this.configService.get<string>('AWS_Q1_QUEUE_URL') ?? '';
    const jobId = uuidv4();

    if (!sqsUrl) {
      this.logger.error('SQS URL is missing');
      throw new Error('SQS configuration error');
    }

    try {
      await this.sqsProducerService.sendMessage(sqsUrl, jobId, data);

      const queueRecord = await this.queueRepository.create({
        jobId: jobId,
        payload: data,
        externalId: String(data.dealId),
        queueType: QueueType.SYNC_JOB,
        sourceType: SourceType.HUBSPOT,
        status: QueueStatus.QUEUED,
        flow: data.quationFlow as unknown as Flow,
      });

      await this.queueRepository.saveQueueItem(queueRecord);

      this.logger.log(`Quotation flow queued successfully`, {
        jobId,
        dealId: data.dealId,
      });

      return {
        success: true,
        message: 'Quotation flow sent to SQS successfully',
        jobId: jobId,
      };
    } catch (error) {
      this.logger.error('Failed to send quotation flow', {
        error: error?.message,
        data,
        jobId,
      });

      return {
        success: false,
        message: 'Failed to send quotation flow',
        error: error?.message,
        jobId: jobId,
      };
    }
  }

  private async isQuotationFlow(jobId: string, flow: Flow): Promise<boolean> {
    this.logger.log(`${this.isQuotationFlow.name} JobId = ${jobId}`);

    const job = await this.queueRepository.findByJobId(jobId);

    if (!job) return false;

    return job.flow === flow && job.sourceType === SourceType.HUBSPOT;
  }

  async ifOfflineQuotionFlow(jobId: string): Promise<boolean> {
    return this.isQuotationFlow(jobId, Flow.OFFLINE);
  }

  async ifOnlineQuotionFlow(jobId: string): Promise<boolean> {
    return this.isQuotationFlow(jobId, Flow.ONLINE);
  }
}
