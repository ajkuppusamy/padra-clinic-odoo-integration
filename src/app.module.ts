import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

// DB_IMPORTS

// GLOBAL_IMPORTS
import { HubspotModule } from '@libs/hubspot/hubspot.module';
import { AwsSqsModule } from '@libs/aws_sqs/awsSqs.module';
import { AuthGuard } from '@common/guard';
import { LoggerMiddleware } from '@common/middlewares';

// CONTROLLER_IMPORTS
import { HubspotModule as HubspotControllerModule } from '@modules/hubspot/hubspot.module';
import { HealthModule } from '@modules/health/health.module';

import { RATE_LIMIT_REQUESTS, RATE_LIMIT_TIME } from '@common/constants';
import { JwtStrategy } from '@common/stratagies';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          limit: RATE_LIMIT_REQUESTS,
          ttl: RATE_LIMIT_TIME,
        },
      ],
    }),
    // DM_IMPORTS_MODULES
    // IMPORTS_MODULES
    HubspotModule,
    HubspotControllerModule,
    AwsSqsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    JwtStrategy,
    JwtService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard, // Global Auth Guard
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
