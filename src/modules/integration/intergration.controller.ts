import { Controller, Get } from '@nestjs/common';
import { IntegrationService } from './integration.service';

@Controller('test')
export class HubspotController {
  constructor(private readonly integrationService: IntegrationService) {}

  @Get()
  async sendQuotationFlow() {
    return this.integrationService.dealExecutionProcess('205142180814', '2');
  }
}
