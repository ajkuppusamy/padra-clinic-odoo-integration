import { Controller, Post, Body, HttpCode, HttpStatus, Headers, UseGuards, Get, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { OdooService } from './odoo.service';
import { ApiTags, ApiOperation, ApiHeaders, ApiResponse, ApiBody, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ODOO_WEBHOOK_EVENT_NAMES, isValidOdooEventName } from './interfaces/odoo-webhook';
import { BadRequestException } from '@nestjs/common';
import { OdooEventWebhookDto, OdooWebhookDto } from './dto/odoo-webhook.dto';
import { ApiKeyAuthGuard, OdooWebhookGuard } from '@common/guard';

@ApiTags('Odoo Webhooks')
@Controller('odoo')
export class OdooController {
  constructor(private readonly odooService: OdooService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  // @UseGuards(OdooWebhookGuard)
  @ApiOperation({
    summary: 'Handle Odoo webhook events',
    description: 'Receives webhook events from Odoo. Event type is determined by x-odoo-event header.',
  })
  @ApiHeaders([
    {
      name: 'x-webhook-event',
      required: true,
      description: 'Event name from Odoo',
      enum: ODOO_WEBHOOK_EVENT_NAMES,
    },
    {
      name: 'x-webhook-signature',
      required: false,
      description: 'Webhook signature for validation',
    },
  ])
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or missing event name' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async handlingWebhook(@Headers('x-webhook-event') eventHeader: string, @Body() body: OdooWebhookDto | OdooEventWebhookDto) {
    if (!eventHeader || !isValidOdooEventName(eventHeader)) throw new BadRequestException('Missing x-odoo-event or Invalid headeer');

    return await this.odooService.handlingWebhook(eventHeader, body);
  }

  @Get('products')
  // @UseGuards(ApiKeyAuthGuard)
  @ApiOperation({ summary: 'Get products by company or pipeline with pagination' })
  @ApiQuery({
    name: 'companyName',
    type: String,
    required: false,
    example: 'padra',
  })
  @ApiQuery({
    name: 'pipelineId',
    type: Number,
    required: false,
    example: 1532546015,
  })
  @ApiQuery({
    name: 'page',
    type: Number,
    required: false,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    type: Number,
    required: false,
    example: 100,
  })
  @ApiHeaders([
    {
      name: 'o-x-api-key',
      required: true,
      description: 'Odoo Api Key',
    },
  ])
  @ApiResponse({ status: 200, description: 'List of products' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async listProducts(
    @Query('companyName') companyName?: string,
    @Query('pipelineId') pipelineId?: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    if (pipelineId) {
      return this.odooService.listProductbyPipelineId(Number(pipelineId), page, limit);
    }

    return this.odooService.listProductbyCompanyName(companyName || '', page, limit);
  }
}
