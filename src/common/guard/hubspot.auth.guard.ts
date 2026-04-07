import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HubspotSignatureService } from './hubspot.signature';

@Injectable()
export class HubspotAuthGuard implements CanActivate {
  private readonly logger = new Logger(HubspotAuthGuard.name);
  private readonly hubSpotSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly signatureService: HubspotSignatureService,
  ) {
    this.hubSpotSecret =
      this.configService.get<string>('HUBSPOT_CLIENT_SECRET') ?? '';
  }

  private getSignatureToValidate(
    v1: string,
    v2: string,
    v3: string,
    timestamp: string,
  ): { version: string; signature: string } {
    // Check V3 first (most secure)
    if (v3 && timestamp) {
      return { version: 'v3', signature: v3 };
    }

    // Then V2
    if (v2) {
      return { version: 'v2', signature: v2 };
    }

    // Then V1
    if (v1) {
      return { version: 'v1', signature: v1 };
    }

    throw new UnauthorizedException('Missing HubSpot signature headers');
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    // Extract signature headers
    const signatureV3 = req.headers['x-hubspot-signature-v3'];
    const signatureV2 = req.headers['x-hubspot-signature-v2'];
    const signatureV1 = req.headers['x-hubspot-signature'];
    const requestTimestamp = req.headers['x-hubspot-request-timestamp'];

    // Determine which signature to use
    const { version, signature } = this.getSignatureToValidate(
      signatureV1,
      signatureV2,
      signatureV3,
      requestTimestamp,
    );

    if (!this.hubSpotSecret) {
      throw new UnauthorizedException('HubSpot client secret not configured');
    }

    try {
      const isValid = this.signatureService.validateSignature({
        clientSecret: this.hubSpotSecret,
        requestBody: this.signatureService.getRawBody(req),
        signature,
        signatureVersion: version,
        url: this.signatureService.buildRequestUri(req),
        method: req.method.toUpperCase(),
        timestamp: requestTimestamp
          ? parseInt(requestTimestamp, 10)
          : undefined,
      });

      if (!isValid) {
        throw new UnauthorizedException('Invalid HubSpot signature');
      }

      return true;
    } catch (error: any) {
      if (error.message === 'Request timestamp expired') {
        throw new ForbiddenException(error.message);
      }
      throw new UnauthorizedException(error.message || 'Invalid signature');
    }
  }
}
