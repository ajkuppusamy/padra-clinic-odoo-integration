import { Module } from '@nestjs/common';
import { HubspotController } from './hubspot.controller';
import { HubspotService } from './hubspot.service';
import { DatabaseModule } from '@common/database/database.module';
import { OdooService } from '@modules/odoo/odoo.service';
import { HubspotService as HubspotLibService } from '@libs/hubspot/hubspot.service';

@Module({
  imports: [DatabaseModule],
  controllers: [HubspotController],
  providers: [HubspotService, OdooService, HubspotLibService],
  exports: [HubspotService],
})
export class HubspotModule {}
