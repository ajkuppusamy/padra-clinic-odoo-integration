import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import { Request, Response, NextFunction, CookieOptions, RequestHandler } from 'express';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
// DB_IMPORTS

import { AppModule } from './app.module';

import { ResponseInterceptor } from '@common/interceptors';
import { HttpExceptionFilter } from '@common/filters';

interface CsrfRequest extends Request {
  cookies: Record<string, string>;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  const nodeEnv = config.get<string>('NODE_ENV') ?? 'dev';
  const corsOrigins = (config.get<string>('CORS_ORIGIN') ?? '')
    .split(';')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    exposedHeaders: ['X-CSRF-Token'],
  });

  // DB_CONFIGS

  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser() as RequestHandler);
  app.disable('x-powered-by');

  const swaggerConfig = new DocumentBuilder()
    .setTitle(`padra-clinic-odoo-integration API - (${nodeEnv})`)
    .setDescription('padra-clinic-odoo-integration API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('/api/doc', app, document);

  app.useGlobalInterceptors(new ResponseInterceptor());

  app.use((req: CsrfRequest, res: Response, next: NextFunction) => {
    const cookieOptions: CookieOptions = {
      httpOnly: true,
      sameSite: 'strict',
      secure: nodeEnv === 'prd',
    };

    if (!req.cookies['XSRF-TOKEN']) {
      const token = crypto.randomBytes(32).toString('hex');
      res.cookie('XSRF-TOKEN', token, cookieOptions);
    }

    const csrfToken = req.cookies['XSRF-TOKEN'] || '';
    res.setHeader('X-CSRF-Token', csrfToken);

    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.use(
    bodyParser.json({
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  await app.listen(port);
  Logger.log(`🚀 padra-clinic-odoo-integration Express app server running on port ${port} in ${nodeEnv} mode`);
}

void bootstrap();
