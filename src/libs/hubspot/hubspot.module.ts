import { Module, Global } from '@nestjs/common';
import { HubspotService } from './hubspot.service';

@Global()
@Module({
  providers: [HubspotService],
  exports: [HubspotService],
})
export class HubspotModule {}
