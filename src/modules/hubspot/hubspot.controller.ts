import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { HubspotService } from './hubspot.service';
import { QuotationFlow } from './dto/quotation-flow.dto';
import { HubspotAuthGuard } from '@common/guard';

@Controller('hubspot')
export class HubspotController {
  constructor(private readonly hubspotService: HubspotService) {}

  @Post('quotation-flow')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HubspotAuthGuard)
  async sendQuotationFlow(@Body() body: QuotationFlow) {
    return this.hubspotService.sendQuotationFlow(body);
  }
}
