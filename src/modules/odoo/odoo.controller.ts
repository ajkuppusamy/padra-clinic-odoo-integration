import { Controller, Post, Param, Body, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';

import { OdooWebhookGuard } from '@common/guard';
import { OdooService } from './odoo.service';
import { ApiTags, ApiOperation, ApiParam, ApiHeader, ApiResponse, ApiBody } from '@nestjs/swagger';

@ApiTags('Odoo Webhooks')
@Controller('odoo')
export class OdooController {
  constructor(private readonly odooService: OdooService) {}

  @Post('webhook/:eventName')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OdooWebhookGuard)
  @ApiOperation({ summary: 'Handle Odoo webhook events' })
  @ApiParam({
    name: 'eventName',
    required: true,
    example: 'product_create',
    description: 'Event name from Odoo (fallback if header not present)',
  })
  @ApiHeader({
    name: 'x-odoo-event',
    required: false,
    description: 'Actual event name (overrides path param)',
    example: 'product_created',
  })
  @ApiHeader({
    name: 'x-odoo-signature',
    required: false,
    description: 'Webhook signature for validation (if implemented)',
  })
  @ApiBody({
    schema: {
      example: {
        id: 123,
        name: 'Sample Product',
        price: 100,
        quantity: 10,
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully',
    schema: {
      example: {
        success: true,
        message: 'Webhook processed successfully',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized (invalid signature)',
  })
  async handlingWebhook(@Param('eventName') eventName: string, @Body() body: Record<string, any>, @Req() req: Request) {
    const eventHeader = this.getCaseInsensitiveHeader(req.headers, 'x-odoo-event');
    const finalEventName = eventHeader ?? eventName;
    if (eventHeader && eventHeader !== eventName) {
      console.warn(`Event mismatch: param=${eventName}, header=${eventHeader}. Using header value.`);
    }

    return await this.odooService.handlingWebhook(finalEventName, body);
  }

  private getCaseInsensitiveHeader(headers: any, headerName: string): string | undefined {
    const lowerHeaderName = headerName.toLowerCase();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === lowerHeaderName) {
        return headers[key] as string;
      }
    }
    return undefined;
  }
}
