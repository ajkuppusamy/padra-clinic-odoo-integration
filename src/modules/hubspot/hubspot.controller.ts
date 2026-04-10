import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { HubspotService } from './hubspot.service';
import { Quotation } from './dto/quotation-flow.dto';
import { HubspotAuthGuard } from '@common/guard';

import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';

@ApiTags('Hubspot')
@Controller('hubspot')
export class HubspotController {
  constructor(private readonly hubspotService: HubspotService) {}

  @Post('quotation')
  @HttpCode(HttpStatus.OK)
  // @UseGuards(HubspotAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Send quotation to HubSpot' })
  @ApiBody({ type: Quotation })
  @ApiResponse({
    status: 200,
    description: 'Quotation successfully sent to HubSpot',
    schema: {
      example: {
        success: true,
        message: 'Quotation processed successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async sendQuotationFlow(@Body() body: Quotation) {
    return this.hubspotService.sendQuotation(body);
  }
}
