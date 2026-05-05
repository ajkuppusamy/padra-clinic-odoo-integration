import { Module, Global } from '@nestjs/common';
import { OdooService } from './odoo.service';
import { OdooConfigService } from './config/odoo.config';
import { HttpModule } from '@nestjs/axios';
import * as https from 'https';

@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 30000,
        maxRedirects: 5,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      }),
    }),
  ],
  providers: [OdooService, OdooConfigService],
  exports: [OdooService],
})
export class OdooModule {}
