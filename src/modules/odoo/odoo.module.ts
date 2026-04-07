import { Module, DynamicModule, Provider, Global } from '@nestjs/common';
import { OdooService } from './odoo.service';

@Global()
@Module({
  imports: [],
  providers: [OdooService],
  exports: [OdooService],
})
export class OdooModule {}
