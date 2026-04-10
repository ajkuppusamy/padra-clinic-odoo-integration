import { Module } from '@nestjs/common';

import { DatabaseModule } from '@common/database/database.module';
import { IntegrationService } from './integration.service';
import { OdooModule } from '@modules/odoo/odoo.module';
import { HubspotModule } from '@modules/hubspot/hubspot.module';

@Module({
  imports: [DatabaseModule, OdooModule, HubspotModule],
  controllers: [],
  providers: [IntegrationService],
  exports: [IntegrationService],
})
export class IntegrationModule {}
