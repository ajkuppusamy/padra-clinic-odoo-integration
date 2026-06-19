// config/odoo.config.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OdooConfig } from '../interfaces';

/**
 * Service for managing Odoo configuration
 *
 * @description Handles loading and validation of Odoo configuration from environment variables
 */
@Injectable()
export class OdooConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Retrieves and validates Odoo configuration
   *
   * @returns {OdooConfig} Validated Odoo configuration object
   * @throws {Error} When required configuration is missing
   */
  getConfig(): OdooConfig {
    const baseURL = this.configService.get<string>('ODOO_BASE_URL');
    const apiKey = this.configService.get<string>('ODOO_API_KEY');
    const companyId = this.configService.get<string>('ODOO_COMPANY_ID');
    const maxConcurrent = Number(this.configService.get<string>('ODOO_MAX_CONCURRENT', '5'));
    const intervalMs = Number(this.configService.get<string>('ODOO_REQUEST_INTERVAL', '100'));
    const timeout = this.configService.get<number>('ODOO_TIMEOUT', 30000);
    const retryAttempts = this.configService.get<number>('ODOO_RETRY_ATTEMPTS', 3);
    const retryDelay = this.configService.get<number>('ODOO_RETRY_DELAY', 1000);
    const searchApiKey = this.configService.get<string>('ODOO_SEARCH_API_KEY') as string;
    const searchAPIURL = this.configService.get<string>('ODOO_SEARCH_API') as string;
    const fileUploadUrl = this.configService.get<string>('ODOO_FILE_UPLOAD_URL') as string;

    if (!baseURL) {
      throw new Error('ODOO_BASE_URL configuration is missing');
    }

    if (!apiKey) {
      throw new Error('ODOO_API_KEY configuration is missing');
    }

    return {
      baseURL,
      apiKey,
      companyId,
      maxConcurrent,
      intervalMs,
      timeout,
      retryAttempts,
      retryDelay,
      searchApiKey,
      searchAPIURL,
      fileUploadUrl,
    };
  }

  /**
   * Gets a specific configuration value
   *
   * @template K - Configuration key type
   * @param {K} key - Configuration key
   * @returns {OdooConfig[K]} Configuration value
   */
  get<K extends keyof OdooConfig>(key: K): OdooConfig[K] {
    const config = this.getConfig();
    return config[key];
  }
}
