import { Module } from '@nestjs/common';
import { OdooService } from './odoo.service';
import { OdooController } from './odoo.controller';
import { DatabaseModule } from '@common/database/database.module';
import { HubspotService } from '@modules/hubspot/hubspot.service';

@Module({
  imports: [DatabaseModule],
  controllers: [OdooController],
  providers: [OdooService, HubspotService],
  exports: [OdooService],
})
export class OdooModule {}
