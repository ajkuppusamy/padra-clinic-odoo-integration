import { Injectable, HttpException, HttpStatus, Logger, UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, Observable, throwError, timer } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
import PQueue from 'p-queue';
import { OdooConfigService } from './config/odoo.config';
import {
  CashPaymentRequest,
  ContactSearchResponse,
  ConvertQuotationResponse,
  CreateAppointmentRequest,
  CreateAppointmentResponse,
  CreateContactRequest,
  CreateContactResponse,
  CreateInvoiceRequest,
  CreateInvoiceResponse,
  CreateProductRequest,
  CreateProductResponse,
  CreateQuotationRequest,
  CreateQuotationResponse,
  CreateRefundRequest,
  CreateRefundResponse,
  DownloadInvoiceLinkResponse,
  GetContactResponse,
  GetInvoiceResponse,
  GetPaymentStatusResponse,
  GetProductResponse,
  GetRefundResponse,
  ListRefundsResponse,
  ListWebhooksResponse,
  OfflineCardPaymentRequest,
  PaymentResponse,
  SearchReadParams,
  TabiTamaraPaymentRequest,
  UpdateAppointmentRequest,
  UpdateAppointmentResponse,
  UpdateContactRequest,
  UpdateInvoiceRequest,
  UpdateInvoiceResponse,
  UpdateProductRequest,
  UpdateProductResponse,
  UpdateQuotationRequest,
} from './interfaces';
import { Product } from '@modules/odoo/interfaces';
import { ERROR_MESSAGES } from '@common/constants';

/**
 * Service for interacting with Odoo ERP system API
 *
 * @description Provides comprehensive CRUD operations for Odoo resources including
 * contacts, products, quotations, invoices, payments, refunds, and appointments.
 * Implements rate limiting via PQueue and configurable retry logic.
 *
 * @property {string} baseURL - Base URL for Odoo API endpoints
 * @property {string} apiKey - API key for authentication
 * @property {string} [companyId] - Optional company ID for multi-company environments
 * @property {PQueue} requestQueue - Queue for managing concurrent requests
 * @property {number} timeout - Request timeout in milliseconds
 * @property {number} retryAttempts - Number of retry attempts for failed requests
 * @property {number} retryDelay - Delay between retry attempts in milliseconds
 */
@Injectable()
export class OdooService {
  private readonly logger = new Logger(OdooService.name);
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly companyId?: string;
  private readonly requestQueue: PQueue;
  private readonly timeout: number | undefined;
  private readonly retryAttempts: number;
  private readonly retryDelay: number;
  private readonly searchApiKey: string;
  private readonly searchUrl?: string;

  /**
   * Creates an instance of OdooService
   *
   * @param {HttpService} httpService - NestJS HTTP service for making requests
   * @param {OdooConfigService} configService - Configuration service for Odoo settings
   *
   * @throws {Error} When required configuration is missing or invalid
   */
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: OdooConfigService,
  ) {
    const config = this.configService.getConfig();

    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.companyId = config.companyId;
    this.timeout = config.timeout ?? undefined;
    this.retryAttempts = config.retryAttempts;
    this.retryDelay = config.retryDelay;
    this.searchApiKey = config.searchApiKey;
    this.searchUrl = config.searchAPIURL;

    this.requestQueue = new PQueue({
      concurrency: config.maxConcurrent,
      interval: config.intervalMs,
      intervalCap: config.maxConcurrent,
    });
  }

  /**
   * Constructs HTTP headers for API requests
   *
   * @returns {Record<string, string>} Headers object containing API key and content type
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.companyId) {
      headers['X-Company-Id'] = this.companyId;
    }

    return headers;
  }

  private getSearchHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.searchApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * Executes an HTTP request with rate limiting, retry logic, and error handling
   *
   * @template T - Expected response data type
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE, etc.)
   * @param {string} path - API endpoint path
   * @param {any} [data] - Request payload for POST/PUT requests
   * @returns {Promise<T>} Promise resolving to the response data
   * @throws {HttpException} When request fails after all retry attempts
   */
  private async request<T>(method: string, path: string, data?: any, searchAPIHeaders?: Record<string, string>): Promise<T> {
    const url = searchAPIHeaders ? this.searchUrl : `${this.baseURL}${path}`;

    this.logger.debug('HTTP Request', {
      method,
      path,
      baseURL: this.baseURL,
      searchURL: this.searchUrl,
      finalURL: url,
      isSearchAPI: !!searchAPIHeaders,
    });

    return await this.requestQueue.add(async () => {
      try {
        const response = await firstValueFrom(
          this.httpService
            .request({
              method,
              url: searchAPIHeaders ? `${this.searchUrl}${path}` : `${this.baseURL}${path}`,
              headers: searchAPIHeaders ?? this.getHeaders(),
              data,
              timeout: this.timeout,
            })
            .pipe(
              retry({
                count: this.retryAttempts,
                delay: (_error, retryCount) => timer(retryCount * 1000),
              }),
            ),
        );

        if (!response) {
          throw new Error('Empty response from HTTP service');
        }

        return response.data;
      } catch (error) {
        return this.handleCatchError(error, method, path);
      }
    });
  }
  private logRequest(method: string, path: string): void {
    this.logger.debug(`${method} ${path}`);
  }

  private handleError(error: any, method: string, path: string): Observable<never> {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || error.response.data;

      this.logger.error(`${this.handleError.name} - ${method} ${path} failed: ${status} - ${message}`);

      if (status === 401) {
        throw new UnauthorizedException(ERROR_MESSAGES.UNAUTHORIZED);
      }
      if (status === 403) {
        throw new ForbiddenException(ERROR_MESSAGES.FORBIDDEN);
      }
      if (status === 404) {
        throw new NotFoundException(ERROR_MESSAGES.RECORD_NOT_FOUND);
      }
      if (status === 429) {
        throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      }

      throw new HttpException(message, status);
    }

    if (error.code === 'ECONNABORTED') {
      this.logger.error(`${method} ${path} timeout`);
      throw new HttpException('Request timeout', HttpStatus.REQUEST_TIMEOUT);
    }

    this.logger.error(`${method} ${path} error: ${error.message}`);
    throw new HttpException(error.message || 'Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private handleCatchError(error: any, method: string, path: string): never {
    if (error instanceof HttpException) {
      throw error;
    }
    this.logger.error(`${method} ${path} unexpected: ${error.message}`);
    throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  /**
   * Creates a new contact in Odoo
   *
   * @param {CreateContactRequest} data - Contact creation data
   * @returns {Promise<CreateContactResponse>} Promise resolving to created contact details
   * @throws {HttpException} When validation fails or API error occurs
   */
  async createContact(data: CreateContactRequest): Promise<CreateContactResponse> {
    return await this.request<CreateContactResponse>('POST', '/contacts', data);
  }

  /**
   * Updates an existing contact
   *
   * @param {string} contactId - Unique identifier of the contact
   * @param {UpdateContactRequest} data - Contact update data
   * @returns {Promise<void>} Promise resolving when update is complete
   * @throws {HttpException} When contact not found or validation fails
   */
  async updateContact(contactId: string, data: UpdateContactRequest): Promise<void> {
    await this.request<void>('PUT', `/contacts/${contactId}`, data);
  }

  /**
   * Retrieves contact details by ID
   *
   * @param {string} contactId - Unique identifier of the contact
   * @returns {Promise<GetContactResponse>} Promise resolving to contact details
   * @throws {HttpException} When contact not found
   */
  async getContact(contactId: string): Promise<GetContactResponse> {
    return await this.request<GetContactResponse>('GET', `/contacts/${contactId}`);
  }

  /**
   * Creates a new product in Odoo
   *
   * @param {CreateProductRequest} data - Product creation data
   * @returns {Promise<CreateProductResponse>} Promise resolving to created product details
   * @throws {HttpException} When validation fails or API error occurs
   */
  async createProduct(data: CreateProductRequest): Promise<CreateProductResponse> {
    return await this.request<CreateProductResponse>('POST', '/products', data);
  }

  /**
   * Updates an existing product
   *
   * @param {string} productId - Unique identifier of the product
   * @param {UpdateProductRequest} data - Product update data
   * @returns {Promise<UpdateProductResponse>} Promise resolving to updated product details
   * @throws {HttpException} When product not found or validation fails
   */
  async updateProduct(productId: string, data: UpdateProductRequest): Promise<UpdateProductResponse> {
    return await this.request<UpdateProductResponse>('PUT', `/products/${productId}`, data);
  }

  /**
   * Retrieves product details by ID
   *
   * @param {string} productId - Unique identifier of the product
   * @returns {Promise<GetProductResponse>} Promise resolving to product details
   * @throws {HttpException} When product not found
   */
  async getProduct(productId: string): Promise<GetProductResponse> {
    return await this.request<GetProductResponse>('GET', `/products/${productId}`);
  }

  /**
   * Creates a new quotation (sales order)
   *
   * @param {CreateQuotationRequest} data - Quotation creation data
   * @returns {Promise<CreateQuotationResponse>} Promise resolving to created quotation details
   * @throws {HttpException} When validation fails or API error occurs
   */
  async createQuotation(data: CreateQuotationRequest): Promise<CreateQuotationResponse> {
    return await this.request<CreateQuotationResponse>('POST', '/quotations', data);
  }

  /**
   * Updates an existing quotation
   *
   * @param {string} quotationId - Unique identifier of the quotation
   * @param {UpdateQuotationRequest} data - Quotation update data
   * @returns {Promise<CreateQuotationResponse>} Promise resolving to updated quotation details
   * @throws {HttpException} When quotation not found or validation fails
   */
  async updateQuotation(quotationId: string, data: UpdateQuotationRequest): Promise<CreateQuotationResponse> {
    return await this.request<CreateQuotationResponse>('PUT', `/quotations/${quotationId}`, data);
  }

  /**
   * Converts a quotation to an invoice
   *
   * @param {string} quotationId - Unique identifier of the quotation
   * @returns {Promise<ConvertQuotationResponse>} Promise resolving to converted invoice details
   * @throws {HttpException} When quotation not found or conversion fails
   */
  async convertQuotationToInvoice(quotationId: string): Promise<ConvertQuotationResponse> {
    return await this.request<ConvertQuotationResponse>('POST', `/quotations/${quotationId}/convert`, {});
  }

  /**
   * Creates a new invoice
   *
   * @param {CreateInvoiceRequest} data - Invoice creation data
   * @returns {Promise<CreateInvoiceResponse>} Promise resolving to created invoice details
   * @throws {HttpException} When validation fails or API error occurs
   */
  async createInvoice(data: CreateInvoiceRequest): Promise<CreateInvoiceResponse> {
    return await this.request<CreateInvoiceResponse>('POST', '/invoices', data);
  }

  /**
   * Updates an existing invoice
   *
   * @param {string} invoiceId - Unique identifier of the invoice
   * @param {UpdateInvoiceRequest} data - Invoice update data
   * @returns {Promise<UpdateInvoiceResponse>} Promise resolving to updated invoice details
   * @throws {HttpException} When invoice not found or validation fails
   */
  async updateInvoice(invoiceId: string, data: UpdateInvoiceRequest): Promise<UpdateInvoiceResponse> {
    return await this.request<UpdateInvoiceResponse>('PUT', `/invoices/${invoiceId}`, data);
  }

  /**
   * Retrieves invoice details by ID
   *
   * @param {string} invoiceId - Unique identifier of the invoice
   * @returns {Promise<GetInvoiceResponse>} Promise resolving to invoice details
   * @throws {HttpException} When invoice not found
   */
  async getInvoice(invoiceId: string): Promise<GetInvoiceResponse> {
    return await this.request<GetInvoiceResponse>('GET', `/invoices/${invoiceId}`);
  }

  /**
   * Retrieves download link for invoice PDF
   *
   * @param {string} invoiceId - Unique identifier of the invoice
   * @returns {Promise<DownloadInvoiceLinkResponse>} Promise resolving to download link
   * @throws {HttpException} When invoice not found or PDF generation fails
   */
  async getInvoiceDownloadLink(invoiceId: string): Promise<DownloadInvoiceLinkResponse> {
    return await this.request<DownloadInvoiceLinkResponse>('GET', `/invoices/${invoiceId}/download-link`);
  }

  /**
   * Processes Tabi Tamara payment
   *
   * @param {TabiTamaraPaymentRequest} data - Tabi Tamara payment data
   * @returns {Promise<PaymentResponse>} Promise resolving to payment processing result
   * @throws {HttpException} When payment processing fails
   */
  async processTabiTamaraPayment(data: TabiTamaraPaymentRequest): Promise<PaymentResponse> {
    return await this.request<PaymentResponse>('POST', '/payments/tabi-tamara', data);
  }

  /**
   * Processes offline card payment
   *
   * @param {OfflineCardPaymentRequest} data - Offline card payment data
   * @returns {Promise<PaymentResponse>} Promise resolving to payment processing result
   * @throws {HttpException} When payment processing fails
   */
  async processOfflineCardPayment(data: OfflineCardPaymentRequest): Promise<PaymentResponse> {
    return await this.request<PaymentResponse>('POST', '/payments/offline-card', data);
  }

  /**
   * Processes cash payment
   *
   * @param {CashPaymentRequest} data - Cash payment data
   * @returns {Promise<PaymentResponse>} Promise resolving to payment processing result
   * @throws {HttpException} When payment processing fails
   */
  async processCashPayment(data: CashPaymentRequest): Promise<PaymentResponse> {
    return await this.request<PaymentResponse>('POST', '/payments/cash', data);
  }

  /**
   * Retrieves payment status for an invoice
   *
   * @param {string} invoiceId - Unique identifier of the invoice
   * @returns {Promise<GetPaymentStatusResponse>} Promise resolving to payment status
   * @throws {HttpException} When invoice not found
   */
  async getPaymentStatus(invoiceId: string): Promise<GetPaymentStatusResponse> {
    return await this.request<GetPaymentStatusResponse>('GET', `/payments/status/${invoiceId}`);
  }

  /**
   * Creates a refund for an invoice
   *
   * @param {CreateRefundRequest} data - Refund creation data
   * @returns {Promise<CreateRefundResponse>} Promise resolving to created refund details
   * @throws {HttpException} When refund creation fails
   */
  async createRefund(data: CreateRefundRequest): Promise<CreateRefundResponse> {
    return await this.request<CreateRefundResponse>('POST', '/refunds', data);
  }

  /**
   * Retrieves refund details by ID
   *
   * @param {string} refundId - Unique identifier of the refund
   * @returns {Promise<GetRefundResponse>} Promise resolving to refund details
   * @throws {HttpException} When refund not found
   */
  async getRefund(refundId: string): Promise<GetRefundResponse> {
    const encodedRefundId = encodeURIComponent(refundId);
    return await this.request<GetRefundResponse>('GET', `/refunds/${encodedRefundId}`);
  }

  /**
   * Lists all refunds for a specific invoice
   *
   * @param {string} invoiceId - Unique identifier of the invoice
   * @returns {Promise<ListRefundsResponse>} Promise resolving to list of refunds
   * @throws {HttpException} When invoice not found
   */
  async listRefundsForInvoice(invoiceId: string): Promise<ListRefundsResponse> {
    return await this.request<ListRefundsResponse>('GET', `/invoices/${invoiceId}/refunds`);
  }

  /**
   * Creates a new appointment
   *
   * @param {CreateAppointmentRequest} data - Appointment creation data
   * @returns {Promise<CreateAppointmentResponse>} Promise resolving to created appointment details
   * @throws {HttpException} When validation fails or API error occurs
   */
  async createAppointment(data: CreateAppointmentRequest): Promise<CreateAppointmentResponse> {
    return await this.request<CreateAppointmentResponse>('POST', '/appointments', data);
  }

  /**
   * Updates an existing appointment
   *
   * @param {string} appointmentId - Unique identifier of the appointment
   * @param {UpdateAppointmentRequest} data - Appointment update data
   * @returns {Promise<UpdateAppointmentResponse>} Promise resolving to updated appointment details
   * @throws {HttpException} When appointment not found or validation fails
   */
  async updateAppointment(appointmentId: string, data: UpdateAppointmentRequest): Promise<UpdateAppointmentResponse> {
    return await this.request<UpdateAppointmentResponse>('PUT', `/appointments/${appointmentId}`, data);
  }

  /**
   * Lists all configured webhooks
   *
   * @returns {Promise<ListWebhooksResponse>} Promise resolving to list of webhooks
   * @throws {HttpException} When API error occurs
   */
  async listConfiguredWebhooks(): Promise<ListWebhooksResponse> {
    return await this.request<ListWebhooksResponse>('GET', '/webhooks');
  }

  /**
   * Search Objects
   *
   * @param {SearchReadParams} search - Search parameters
   * @returns {Promise<ContactSearchResponse>} Promise resolving to search results
   * @throws {HttpException} When API error occurs
   */
  async search(search: Partial<SearchReadParams>, path: string): Promise<ContactSearchResponse[] | Product[]> {
    return await this.request<ContactSearchResponse[] | Product[]>('POST', path, search, this.getSearchHeaders());
  }
}
