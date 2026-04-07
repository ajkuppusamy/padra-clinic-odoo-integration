import { Module } from '@nestjs/common';
import { HubspotAuthGuard, HubspotSignatureService } from '@common/guard';

import { HubspotController } from './hubspot.controller';
import { HubspotService } from './hubspot.service';

@Module({
  imports: [],
  controllers: [HubspotController],
  providers: [HubspotService, HubspotAuthGuard, HubspotSignatureService],
})
export class HubspotModule {}
