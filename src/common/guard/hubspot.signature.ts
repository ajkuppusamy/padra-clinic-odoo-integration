import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface SignatureValidationOptions {
  clientSecret: string;
  requestBody: string;
  signature: string;
  signatureVersion?: string;
  url?: string;
  method?: string;
  timestamp?: number;
}

@Injectable()
export class HubspotSignatureService {
  private readonly logger = new Logger(HubspotSignatureService.name);
  private readonly MAX_ALLOWED_TIMESTAMP = 5 * 60 * 1000; // 5 minutes

  /**
   * Helper to get raw body from request
   */
  getRawBody(req: any): string {
    if (typeof req.rawBody === 'string') {
      return req.rawBody;
    } else if (req.rawBody) {
      return req.rawBody.toString('utf8');
    } else if (req.body) {
      return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
    return '';
  }

  /**
   * Helper to build request URI
   */
  buildRequestUri(req: any): string {
    const protocol = req.headers['x-forwarded-proto'];
    const host = req.headers['host'] || req.hostname;
    const originalUrl = req.originalUrl || req.url;
    return `${protocol}://${host}${originalUrl}`;
  }

  /**
   * Compare signatures using constant-time comparison
   */
  private compareSignatures(computedSignature: string, receivedSignature: string, signatureVersion: string): boolean {
    try {
      if (signatureVersion === 'v1' || signatureVersion === 'v2') {
        // V1 and V2 use hex encoding
        const computedBuffer = Buffer.from(computedSignature, 'hex');
        const receivedBuffer = Buffer.from(receivedSignature, 'hex');
        return crypto.timingSafeEqual(receivedBuffer, computedBuffer);
      } else {
        // V3 uses base64 encoding
        const computedBuffer = Buffer.from(computedSignature, 'base64');
        const receivedBuffer = Buffer.from(receivedSignature, 'base64');
        return crypto.timingSafeEqual(receivedBuffer, computedBuffer);
      }
    } catch (error) {
      this.logger.warn(`Signature comparison failed: ${['error']?.['message']}`);
      return false;
    }
  }

  /**
   * Compute signature for a specific version
   */
  private computeSignature(
    method: string,
    signatureVersion: string,
    options: {
      clientSecret: string;
      requestBody: string;
      url?: string;
      timestamp?: number;
    },
  ): string {
    const { clientSecret, requestBody, url, timestamp } = options;

    let sourceString: string;

    switch (signatureVersion) {
      case 'v1':
        // V1: SHA256(client_secret + request_body)
        sourceString = clientSecret + requestBody;
        return crypto.createHash('sha256').update(sourceString).digest('hex');

      case 'v2':
        // V2: SHA256(client_secret + http_method + URI + request_body)
        if (!url) {
          throw new Error('URL is required for V2 signature validation');
        }
        sourceString = clientSecret + method + url + requestBody;
        return crypto.createHash('sha256').update(sourceString).digest('hex');

      case 'v3':
        // V3: HMAC-SHA256(method + URI + request_body + timestamp)
        if (!url) {
          throw new Error('URL is required for V3 signature validation');
        }
        if (timestamp === undefined) {
          throw new Error('Timestamp is required for V3 signature validation');
        }
        sourceString = method + url + requestBody + timestamp;
        return crypto.createHmac('sha256', clientSecret).update(sourceString).digest('base64');

      default:
        throw new Error(`Unsupported signature version: ${signatureVersion}`);
    }
  }

  /**
   * Validate HubSpot signature based on version
   */
  validateSignature(options: SignatureValidationOptions): boolean {
    const { signatureVersion = 'v1', method = 'POST', signature, clientSecret, requestBody, url, timestamp } = options;

    // Validate timestamp for V3
    if (signatureVersion === 'v3') {
      const currentTime = Date.now();
      if (timestamp === undefined || currentTime - timestamp > this.MAX_ALLOWED_TIMESTAMP) {
        throw new Error('Request timestamp expired');
      }
    }

    // Compute signature
    const computedSignature = this.computeSignature(method, signatureVersion, {
      clientSecret,
      requestBody,
      url,
      timestamp,
    });

    // Compare signatures
    return this.compareSignatures(computedSignature, signature, signatureVersion);
  }
}
