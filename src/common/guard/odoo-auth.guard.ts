import { ERROR_MESSAGES } from '@common/constants';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const apiKey = (request.headers?.['o-x-api-key'] as string | undefined)?.trim();

    const expectedApiKey = this.configService.get<string>('ODOO_SEARCH_API_KEY')?.trim();

    const isValidApiKey = !!apiKey && !!expectedApiKey && apiKey.length > 0 && apiKey === expectedApiKey;

    if (!isValidApiKey) {
      throw new UnauthorizedException(ERROR_MESSAGES.UNAUTHORIZED);
    }

    return true;
  }
}
