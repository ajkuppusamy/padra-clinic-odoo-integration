import { Module, DynamicModule, Provider, Global } from '@nestjs/common';
import { OdooService } from './odoo.service';
import { OdooConfigService } from './config/odoo.config';
import { HttpModule } from '@nestjs/axios';

@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 30000,
        maxRedirects: 5,
      }),
    }),
  ],
  providers: [OdooService, OdooConfigService],
  exports: [OdooService],
})
export class OdooModule {}
