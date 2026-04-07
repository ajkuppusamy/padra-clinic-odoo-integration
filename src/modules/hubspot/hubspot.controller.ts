import { Body, Controller, HttpCode, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { HubspotAuthGuard } from '@common/guard';
import { HubspotService } from './hubspot.service';
import { HubspotWebhookDto } from './dto';

@UseGuards(HubspotAuthGuard)
@Controller('hubspot')
export class HubspotController {
  constructor(private readonly hubspotService: HubspotService) {}
}
