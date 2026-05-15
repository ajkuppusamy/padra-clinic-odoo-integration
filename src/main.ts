import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { Request, RequestHandler } from 'express';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';
import { ResponseInterceptor } from '@common/interceptors';
import { HttpExceptionFilter } from '@common/filters';
import { loadHubSpotConfig } from '@libs/hubspot/config/hubspot.config';
import { loadSaleServiceTypeConfig } from '@libs/odoo/config/service-type.config';
import { loadTreatmentCategoryConfig } from '@libs/odoo/config/treatment-category.config';

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
    allowedHeaders: ['Content-Type', 'api-key'], // TODO: Allow incoming header [api-key] hubspot custom header.
  });

  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser() as RequestHandler);
  app.disable('x-powered-by');

  const swaggerConfig = new DocumentBuilder()
    .setTitle(`Padra clinic odoo integration API - (${nodeEnv})`)
    .setDescription('Padra clinic odoo integration API Documentation')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('/api/v1/doc', app, document);

  // Add redirection to /api/v1/swagger
  const redirectToSwagger = (req: any, res: any, next: any) => {
    if (req.path === '/') res.redirect('/api/v1/doc');
    else next();
  };

  app.useGlobalInterceptors(new ResponseInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
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

  loadHubSpotConfig(nodeEnv as unknown as string);
  loadSaleServiceTypeConfig(nodeEnv as unknown as string);
  loadTreatmentCategoryConfig(nodeEnv as unknown as string);
  app.use('/api/v1', redirectToSwagger);
  app.use('/api', redirectToSwagger);
  app.use('/', redirectToSwagger);

  await app.listen(port);
  Logger.log(`🚀 padra-clinic-odoo-integration Express app server running on port ${port} in ${nodeEnv} mode`);
}

void bootstrap();
