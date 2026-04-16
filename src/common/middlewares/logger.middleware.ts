import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LoggerMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const startAt = process.hrtime();
    const { ip, method, originalUrl, body, query, params } = req;
    const userAgent = req.get('user-agent') || '';

    this.logger.log(`${method} ${originalUrl}`);
    this.logger.log(`[${method}] ${originalUrl} | IP: ${ip} | Query: ${JSON.stringify(query)} | Params: ${JSON.stringify(params)} | Body: ${JSON.stringify(body)}`);

    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');

      const diff = process.hrtime(startAt);
      const responseTime = diff[0] * 1e3 + diff[1] * 1e-6;

      this.logger.log(`${method} ${originalUrl} ${statusCode} ${responseTime} ms ${contentLength} - ${userAgent} ${ip}`);
    });

    next();
  }
}
