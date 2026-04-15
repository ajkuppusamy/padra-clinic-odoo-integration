import { Controller, Post, Body, HttpCode, HttpStatus, Headers, UseGuards } from '@nestjs/common';
import { OdooService } from './odoo.service';
import { ApiTags, ApiOperation, ApiHeaders, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ODOO_WEBHOOK_EVENT_NAMES, isValidOdooEventName } from './interfaces/odoo-webhook';
import { BadRequestException } from '@nestjs/common';
import { ProductEventDto, WebhookDto } from './dto/odoo-webhook.dto';
import { OdooWebhookGuard } from '@common/guard';

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
      name: 'x-odoo-event',
      required: true,
      description: 'Event name from Odoo',
      enum: ODOO_WEBHOOK_EVENT_NAMES,
    },
    {
      name: 'x-odoo-signature',
      required: false,
      description: 'Webhook signature for validation',
    },
  ])
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or missing event name' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async handlingWebhook(@Headers('x-odoo-event') eventHeader: string, @Body() body: WebhookDto) {
    if (!eventHeader || !isValidOdooEventName(eventHeader)) throw new BadRequestException('Missing x-odoo-event or Invalid headeer');

    return await this.odooService.handlingWebhook(eventHeader, body);
  }
}
