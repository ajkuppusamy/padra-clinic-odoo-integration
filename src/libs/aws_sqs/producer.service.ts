import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteMessageCommand, SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AwsSqsProducerService {
  private readonly logger = new Logger(AwsSqsProducerService.name);
  private readonly sqs: SQSClient;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION')!;
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID')!;
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY')!;

    this.sqs = new SQSClient({
      region: region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });
  }

  async sendMessage(queueUrl: string, msgGroupId: string = uuidv4(), payload: unknown, eventName: string): Promise<void> {
    try {
      const finalJobId = msgGroupId || uuidv4();

      const groupId = String(eventName).toLowerCase();

      const deduplicationId = String(`${finalJobId}-${Date.now()}`);

      const enrichedPayload = {
        jobId: finalJobId,
        eventName,
        timestamp: new Date().toISOString(),
        data: payload,
      };

      const command = new SendMessageCommand({
        MessageGroupId: groupId, // Must be string
        MessageDeduplicationId: deduplicationId, // Must be string
        QueueUrl: queueUrl, // Must be string
        MessageBody: JSON.stringify(enrichedPayload), // Must be string
        MessageAttributes: {
          jobId: {
            DataType: 'String',
            StringValue: String(finalJobId), // Ensure string
          },
          eventName: {
            DataType: 'String',
            StringValue: String(eventName), // Ensure string
          },
          timestamp: {
            DataType: 'String',
            StringValue: new Date().toISOString(), // Already string
          },
        },
      });

      const result = await this.sqs.send(command);

      this.logger.log(`Message sent to SQS: ${queueUrl}`, {
        messageId: result.MessageId,
        jobId: finalJobId,
        groupId: groupId,
      });
    } catch (error) {
      this.logger.error(`Failed to send message to SQS: ${queueUrl}`, error?.['stack'] || error);
      throw error;
    }
  }

  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    const deleteMessageCmd = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });

    try {
      const res = await this.sqs.send(deleteMessageCmd);
      this.logger.debug(`Deleted message from queue ${queueUrl}`, JSON.stringify(res));
    } catch (error) {
      this.logger.error(`Failed to delete message from queue ${queueUrl}`, (error as Error)?.stack ?? String(error));
      throw error;
    }
  }
}
