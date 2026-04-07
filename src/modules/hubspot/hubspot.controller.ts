import { Body, Controller, HttpCode, HttpStatus, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { HubspotService } from './hubspot.service';
import { QuotationFlow } from './dto/quotation-flow.dto';

@Controller('hubspot')
export class HubspotController {
  constructor(private readonly hubspotService: HubspotService) {}

  @Post('quotation-flow')
  @HttpCode(HttpStatus.OK)
  async sendQuotationFlow(@Body() body: QuotationFlow) {
    return this.hubspotService.sendQuotationFlow(body);
  }
}
