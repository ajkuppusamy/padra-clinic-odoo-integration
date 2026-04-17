import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OdooWebhookGuard implements CanActivate {
  private readonly logger = new Logger(OdooWebhookGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    let signature = request.headers['x-odoo-signature'] as string;
    const rawBody: Buffer = request.rawBody;
    const parsedBody = request.body;
    const secret = this.configService.get<string>('ODOO_WEBHOOK_SECRET');

    this.logger.log(`Headers: ${JSON.stringify(request.headers)}`);

    this.logger.log(`Raw Body: ${rawBody ? rawBody.toString('utf8') : 'N/A'}`);

    this.logger.log(`Parsed Body: ${JSON.stringify(parsedBody)}`);

    if (!secret) {
      this.logger.error('ODOO_WEBHOOK_SECRET is not configured');
      throw new UnauthorizedException('Server configuration error');
    }

    if (!signature) {
      this.logger.warn('Missing X-Odoo-Signature header');
      throw new UnauthorizedException('Missing signature');
    }

    if (!rawBody) {
      this.logger.error('Raw body not available');
      throw new UnauthorizedException('Invalid request');
    }

    if (Array.isArray(signature)) {
      signature = signature[0];
    }

    signature = signature.trim();

    const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    this.logger.debug(`Expected Signature: ${expectedSignature}`);
    this.logger.debug(`Received Signature: ${signature}`);

    const isValid = expectedSignature.length === signature.length && crypto.timingSafeEqual(Buffer.from(expectedSignature, 'utf8'), Buffer.from(signature, 'utf8'));

    if (!isValid) {
      this.logger.warn('Invalid Odoo webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    this.logger.log('Odoo webhook signature verified');

    return true;
  }
}
