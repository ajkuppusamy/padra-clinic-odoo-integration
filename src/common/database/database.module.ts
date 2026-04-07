import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue, Request, Response } from '@common/entities';
import { QueueRepository, RequestRepository, ResponseRepository } from '@common/repositories';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('POSTGRES_HOST'),
        port: configService.get('POSTGRES_PORT'),
        username: configService.get('POSTGRES_USER'),
        password: configService.get('POSTGRES_PASSWORD'),
        database: configService.get('POSTGRES_DB'),
        entities: [Queue, Request, Response],
        synchronize: configService.get('NODE_ENV') === 'dev',
        autoLoadEntities: true,
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Queue, Request, Response]),
  ],
  providers: [QueueRepository, RequestRepository, ResponseRepository],
  exports: [TypeOrmModule, QueueRepository, RequestRepository, ResponseRepository],
})
export class DatabaseModule {}
