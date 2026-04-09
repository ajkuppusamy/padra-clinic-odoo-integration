import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HubspotAuthGuard implements CanActivate {
  private readonly logger = new Logger(HubspotAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const token = request.headers['authorization']; // Bearer token
    const expectedToken = this.configService.get<string>('HUBSPOT_API_KEY') as string;

    if (!expectedToken) {
      this.logger.error('pat token not configured');
      throw new UnauthorizedException('Server config error');
    }

    if (!token) {
      this.logger.warn('Missing Authorization header');
      throw new UnauthorizedException('Missing token');
    }

    const [type, value] = token.split(' ');

    if (type !== 'Bearer' || !value) {
      this.logger.warn('Invalid Authorization format');
      throw new UnauthorizedException('Invalid token format');
    }

    if (value !== expectedToken) {
      this.logger.warn('Unauthorized token attempt');
      throw new UnauthorizedException('Unauthorized');
    }

    this.logger.log('HubSpot request authorized');

    return true;
  }
}
