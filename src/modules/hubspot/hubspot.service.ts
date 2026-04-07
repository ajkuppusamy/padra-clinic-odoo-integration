import { Injectable, Logger } from '@nestjs/common';
import { HubspotService as HubspotLibService } from '@libs/hubspot/hubspot.service';
import { HubspotObjects } from '@common/enums';
import { HubspotWebhookDto } from './dto';

@Injectable()
export class HubspotService {
  private readonly logger = new Logger(HubspotService.name);

  constructor(private readonly hubspotLibservice: HubspotLibService) {}

  async processHubspotWebhook(hubspotWebHook: HubspotWebhookDto[]) {
    this.logger.log(hubspotWebHook);
    const sampleDealData = await this.hubspotLibservice.getHubspotObjectData<any>(HubspotObjects.CONTACTS, hubspotWebHook?.[0].objectId?.toString(), []);
    this.logger.log(sampleDealData);
    return true;
  }
}
