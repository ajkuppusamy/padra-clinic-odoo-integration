import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WebhookAuditDto } from './dto/audit.dto';
import { AuditService } from './audit.service';

@ApiTags('Audit Logs')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Post('logs')
  @ApiOperation({
    summary: 'HubSpot & Odoo Integration Audit Logs',
    description:
      'Fetch HubSpot and Odoo integration webhook processing audit logs with dynamic filters, pagination, latest processed records first, queue processing status tracking, request/response logs, event-based filtering, and external ID/job ID based search support.',
  })
  @ApiBody({
    type: WebhookAuditDto,
    description: 'Dynamic audit log filters for HubSpot and Odoo integration processing records.',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit logs fetched successfully for HubSpot and Odoo integration processing.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request payload or filter parameters.',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error while fetching audit logs.',
  })
  async webhookAudit(@Body() body: WebhookAuditDto) {
    return await this.auditService.webhookAudit(body);
  }
}
