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

  async sendMessage(queueUrl: string, msgGroupId: string = uuidv4(), payload: unknown): Promise<void> {
    try {
      const finalJobId = msgGroupId || uuidv4();

      const enrichedPayload = {
        jobId: finalJobId,
        timestamp: new Date().toISOString(),
        data: payload,
      };

      const command = new SendMessageCommand({
        MessageGroupId: `${msgGroupId}-${finalJobId}`,
        MessageDeduplicationId: `${finalJobId}-${Date.now()}`,
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(enrichedPayload),
        MessageAttributes: {
          jobId: {
            DataType: 'String',
            StringValue: finalJobId,
          },
          timestamp: {
            DataType: 'String',
            StringValue: new Date().toISOString(),
          },
        },
      });
      const result = await this.sqs.send(command);
      this.logger.log(`Message sent to SQS: ${queueUrl}`, {
        messageId: result.MessageId,
        jobId: finalJobId,
      });
    } catch (error) {
      this.logger.error(`Failed to send message to SQS: ${queueUrl}`, ['error']?.['stack']);
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
