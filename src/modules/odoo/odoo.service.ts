import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class OdooService {
  private readonly logger = new Logger(OdooService.name);
}
