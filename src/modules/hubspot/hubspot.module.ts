import { Module } from '@nestjs/common';
import { HubspotController } from './hubspot.controller';
import { HubspotService } from './hubspot.service';
import { DatabaseModule } from '@common/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [HubspotController],
  providers: [HubspotService],
  exports: [HubspotService],
})
export class HubspotModule {}
