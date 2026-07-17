import { Body, Controller, HttpCode, HttpStatus, Post, Param, UseGuards, Query, Get } from '@nestjs/common';
import { HubspotService } from './hubspot.service';
import { HubspotAuthGuard } from '@common/guard';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiHeaders, ApiQuery } from '@nestjs/swagger';
import { HubspotProductDto, HubspotWebhookDto, ProductDto } from './dto';

@ApiTags('Hubspot')
@Controller('hubspot')
// @UseGuards(HubspotAuthGuard)
export class HubspotController {
  constructor(private readonly hubspotService: HubspotService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiHeaders([
    {
      name: 'api-key',
      required: true,
      description: 'API key for authentication',
    },
  ])
  @ApiOperation({
    summary: 'Handle HubSpot deal webhook events',
    description: 'Receives webhook events from HubSpot for deal-related events including creation, updates, and deletions',
  })
  @ApiBody({
    type: HubspotWebhookDto,
    description: 'HubSpot deal webhook payload',
  })
  @ApiResponse({
    status: 200,
    description: 'Deal webhook processed successfully',
    schema: {
      example: {
        success: true,
        message: 'Deal webhook processed successfully',
        dealId: 5001,
        eventType: 'deal.creation',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error - Invalid webhook payload',
    schema: {
      example: {
        statusCode: 400,
        message: ['objectId must be a number', 'portalId should not be empty'],
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
        error: 'Unauthorized',
      },
    },
  })
  @Post('webhook')
  async sendQuotationFlow(@Body() body: HubspotWebhookDto | HubspotWebhookDto[]) {
    return await this.hubspotService.sendSQS(body);
  }

  @ApiOperation({ summary: 'Create line items for a deal from Odoo product' })
  @ApiParam({ name: 'dealId', required: true })
  @ApiBody({ type: HubspotProductDto })
  @ApiHeaders([
    {
      name: 'api-key',
      required: true,
      description: 'API key for authentication',
    },
  ])
  @ApiResponse({ status: 200, description: 'Line item created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @HttpCode(HttpStatus.OK)
  @Post('deals/:dealId/line-items')
  async createLineItems(@Param('dealId') dealId: string, @Body() body: HubspotProductDto) {
    return this.hubspotService.syncOdooProductsToHubSpotLineItems(body, dealId);
  }

  @ApiOperation({
    summary: 'Upload Odoo sales order documents to HubSpot and associate them with a deal',
  })
  @ApiParam({
    name: 'dealId',
    required: true,
    description: 'HubSpot Deal ID',
  })
  @ApiParam({
    name: 'salesOrderId',
    required: true,
    description: 'Odoo Sales Order ID',
  })
  @ApiHeaders([
    {
      name: 'api-key',
      required: true,
      description: 'API key for authentication',
    },
  ])
  @ApiResponse({
    status: 200,
    description: 'Documents uploaded and associated successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @HttpCode(HttpStatus.OK)
  @Post('deals/:dealId/sales-orders/:salesOrderId/documents')
  async uploadSalesOrderDocuments(@Param('dealId') dealId: string, @Param('salesOrderId') salesOrderId: string) {
    return await this.hubspotService.sendSQS(
      {
        objectId: Number(dealId),
        propertyName: `salesOrderId_${Date.now()}`,
        propertyValue: salesOrderId,
      },
      'file_upload',
    );
  }
  @HttpCode(HttpStatus.OK)
  @Get('contacts/:contactId/invoices')
  @ApiParam({
    name: 'contactId',
    description: 'HubSpot Contact ID',
    example: '264179469280',
  })
  @ApiResponse({
    status: 200,
    description: 'Contact associated invoices fetched successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @ApiHeaders([
    {
      name: 'api-key',
      required: true,
      description: 'API key for authentication',
    },
  ])
  async getContactInvoices(@Param('contactId') contactId: string) {
    return await this.hubspotService.getContactInvoices(contactId);
  }
}
