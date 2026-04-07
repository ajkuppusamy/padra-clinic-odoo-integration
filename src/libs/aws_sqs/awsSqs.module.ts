import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SqsModule as NestSqsModule } from '@ssut/nestjs-sqs';
import { SqsConsumerOptions } from '@ssut/nestjs-sqs/dist/sqs.types';

import { getSQSClient } from '@common/config';
import { SQS_QUEUE_CONSUMERS } from '@common/constants';

import { AwsSqsProducerService } from './producer.service';
import { AwsSqsConsumerService } from './consumer.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    NestSqsModule.registerAsync({
      useFactory: (configService: ConfigService) => {
        const consumerConfigs = SQS_QUEUE_CONSUMERS.map((c: string) => ({
          name: configService.get<string>(`AWS_${c}_QUEUE_NAME`) as string,
          queueUrl: configService.get<string>(`AWS_${c}_QUEUE_URL`) as string,
          region: configService.get<string>('AWS_REGION') as string,
          sqs: getSQSClient(configService),
          batchSize: 1,
          suppressFifoWarning: true,
          waitTimeSeconds: 20,
        }));

        return {
          consumers: consumerConfigs as SqsConsumerOptions[],
          producers: [],
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [AwsSqsProducerService, AwsSqsConsumerService],
  exports: [AwsSqsProducerService],
})
export class AwsSqsModule {}
