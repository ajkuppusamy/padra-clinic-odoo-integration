import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OdooWebhookGuard implements CanActivate {
  private readonly logger = new Logger(OdooWebhookGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const signature = request.headers['x-odoo-signature'] as string;
    const rawBody = request.rawBody;
    const parsedBody = request.body;
    const secret = this.configService.get<string>('ODOO_WEBHOOK_SECRET');

    // 🔥 Log Headers
    this.logger.log('Incoming Headers:');
    this.logger.log(JSON.stringify(request.headers, null, 2));

    this.logger.log('Raw Body:');
    this.logger.log(rawBody);

    this.logger.log('Parsed Body:');
    this.logger.log(JSON.stringify(parsedBody, null, 2));

    if (!secret) {
      this.logger.error('ODOO_WEBHOOK_SECRET is not configured');
      throw new UnauthorizedException('Server configuration error');
    }

    if (!signature) {
      this.logger.warn('Missing X-Odoo-Signature header');
      throw new UnauthorizedException('Missing signature');
    }

    if (!rawBody) {
      this.logger.error('Raw body not available for signature validation');
      throw new UnauthorizedException('Invalid request');
    }

    let isValid = false;

    try {
      const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      this.logger.debug(`Expected Signature: ${expectedSignature}`);
      this.logger.debug(`Received Signature: ${signature}`);

      isValid = crypto.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(signature, 'hex'));
    } catch (error) {
      this.logger.error('Signature comparison failed', ['error']?.['stack']);
      throw new UnauthorizedException('Signature validation failed');
    }

    if (!isValid) {
      this.logger.warn('Invalid Odoo webhook signature', {
        signature,
      });
      throw new UnauthorizedException('Invalid signature');
    }

    this.logger.log('Odoo webhook signature verified successfully');

    return true;
  }
}
