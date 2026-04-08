// controllers/odoo-webhook.controller.ts

import { Controller, Post, Param, Body, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';

import { OdooWebhookGuard } from '@common/guard';
import { OdooService } from './odoo.service';

@Controller('odoo')
export class OdooController {
  constructor(private readonly odooService: OdooService) {}

  @Post(':eventName/webhook')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OdooWebhookGuard)
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
