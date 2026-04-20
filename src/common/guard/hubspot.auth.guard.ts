import { ERROR_MESSAGES } from '@common/constants';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HubspotAuthGuard implements CanActivate {
  private readonly logger = new Logger(HubspotAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const headers = request.headers;
    const rawBody = request.rawBody;
    const parsedBody = request.body;

    this.logger.verbose(`Incoming Headers: ${JSON.stringify(headers)}`);

    if (rawBody) {
      this.logger.verbose(`Raw Body: ${Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody}`);
    } else {
      this.logger.warn('Raw body not available');
    }

    this.logger.verbose(`Parsed Body: ${JSON.stringify(parsedBody)}`);

    const apiKey = headers['hub-x-api-key'];
    const expectedApiKey = this.configService.get<string>('HUB_X_API_KEY');

    if (!expectedApiKey) {
      this.logger.error('HUB_X_API_KEY not configured');
      throw new UnauthorizedException('Server config error');
    }

    if (!apiKey) {
      this.logger.warn('Missing HUB_X_API_KEY header');
      throw new UnauthorizedException(ERROR_MESSAGES.UNAUTHORIZED);
    }

    if (apiKey !== expectedApiKey) {
      this.logger.warn(`Invalid API key attempt. Received: ${apiKey}`);
      throw new UnauthorizedException(ERROR_MESSAGES.UNAUTHORIZED);
    }

    this.logger.log('Webhook request authorized');

    return true;
  }
}
