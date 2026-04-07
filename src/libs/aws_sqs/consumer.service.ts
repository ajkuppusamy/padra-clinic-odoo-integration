import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SqsMessageHandler } from '@ssut/nestjs-sqs';
import type { Message } from '@ssut/nestjs-sqs/dist/sqs.types';

import { AwsSqsProducerService } from './producer.service';

const QUEUE_NAMES = {
  Q1: process.env.AWS_Q1_QUEUE_NAME || '',
};

@Injectable()
export class AwsSqsConsumerService {
  private readonly logger = new Logger(AwsSqsConsumerService.name);
  private readonly now = new Date();

  constructor(
    private readonly configService: ConfigService,
    private readonly awsSqsProducerService: AwsSqsProducerService,
  ) {}

  /**
   * Process migration item queue message.
   * @param message
   * @returns {Promise<void>}
   */
  @SqsMessageHandler(QUEUE_NAMES.Q1, false)
  async processMigrationItemQueue(message: Message): Promise<void> {
    try {
      this.logger.debug(
        `Message received from AWS SQS, ${JSON.stringify(message)}`,
      );

      const body: any = JSON.parse(
        (message?.['body'] ?? message?.['Body']) || '{}',
      );

      this.logger.debug(`Data message received!, ${body}`);

      await this.awsSqsProducerService.deleteMessage(
        this.configService.get<string>('AWS_Q1_QUEUE_URL') ?? '',
        message?.['receiptHandle'] ?? message?.['ReceiptHandle'] ?? '',
      );
    } catch (error) {
      this.logger.error(
        `Failed to process message from queue ${QUEUE_NAMES.Q1}`,
        (error as Error)?.stack ?? String(error),
      );
    }
  }
}
