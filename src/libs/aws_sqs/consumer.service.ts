import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SqsMessageHandler } from '@ssut/nestjs-sqs';
import type { Message } from '@ssut/nestjs-sqs/dist/sqs.types';

import { AwsSqsProducerService } from './producer.service';
import { IntegrationService } from '@modules/integration/integration.service';

import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class AwsSqsConsumerService {
  private readonly logger = new Logger(AwsSqsConsumerService.name);
  private readonly now = new Date();

  constructor(
    private readonly configService: ConfigService,
    private readonly awsSqsProducerService: AwsSqsProducerService,
    private readonly integrationService: IntegrationService,
  ) {}

  /**
   * Process migration item queue message.
   * @param message
   * @returns {Promise<void>}
   */
  @SqsMessageHandler(process.env.AWS_Q1_QUEUE_NAME as unknown as string, false)
  async sqsMessageHandler(message: Message): Promise<void> {
    try {
      await this.awsSqsProducerService.deleteMessage(this.configService.get<string>('AWS_Q1_QUEUE_URL') ?? '', message?.['receiptHandle'] ?? message?.['ReceiptHandle'] ?? '');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      this.logger.debug(`Message received from AWS SQS, ${JSON.stringify(message)}`);

      const body: any = JSON.parse((message?.['body'] ?? message?.['Body']) || '{}');
      this.logger.debug(`Body : ${JSON.stringify(body)}`);

      const { eventName, jobId, data } = body;

      this.logger.debug(`Event: ${eventName}, JobId: ${jobId}`);
      this.logger.debug(`Data message received!, ${JSON.stringify(data)}`);

      switch (eventName) {
        case 'deal_update':
          await this.integrationService.dealUpdateProcess(data?.objectId, jobId, data);
          break;
        case 'payment_created':
          await this.integrationService.handlingPaymentCreateEvent(jobId, data);
          break;
        case 'invoice_created':
          await this.integrationService.handlingInvoiceCreated(jobId, data);
          break;
        case 'quotation_status_update':
          await this.integrationService.handlingQuotaionStatus(jobId, data);
          break;
        case 'close_service':
          await this.integrationService.handlingCloseService(jobId, data);
          break;
        case 'close_session':
          await this.integrationService.handlingCloseService(jobId, data);
          break;
        case 'contact_update':
          await this.integrationService.handlingContactProcess(jobId, data);
          break;
        case 'sale_order_line_update':
          await this.integrationService.saleOrderlineUpdate(jobId, data);
          break;
        default:
          this.logger.warn(`Unhandled eventName: ${eventName}`);
          await this.integrationService.handleSkip(jobId, this.sqsMessageHandler.name, `Unhandled eventName: ${eventName}`);
          break;
      }
    } catch (error) {
      this.logger.error(`Failed to process message from queue ${process.env.AWS_Q1_QUEUE_NAME}`, (error as Error)?.stack ?? String(error));
    }
  }
}
