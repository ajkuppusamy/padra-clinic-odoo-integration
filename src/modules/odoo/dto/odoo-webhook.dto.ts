import { WebhookEventType } from '@libs/odoo/enums';
import { ApiPropertyOptional, IntersectionType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

const ToNumber = () =>
  Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;

    const parsed = Number(value);

    return Number.isNaN(parsed) ? value : parsed;
  });

export class WebhookLineDto {
  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  default_code?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  price_subtotal?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  price_unit?: number;

  @ApiPropertyOptional({ example: 395 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  product_id?: number;

  @ApiPropertyOptional({ example: 'BRAUN HAIR TRIMER' })
  @IsOptional()
  @IsString()
  product_name?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  quantity?: number;
}

export class ReconciledInvoiceDto {
  @ApiPropertyOptional({ example: 'INV/2026/00004' })
  @IsOptional()
  @IsString()
  invoice_reference?: string;

  @ApiPropertyOptional({ example: 'in_payment' })
  @IsOptional()
  @IsString()
  payment_state?: string;

  @ApiPropertyOptional({ example: 1.15 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  residual_amount?: number;

  @ApiPropertyOptional({ example: 1.15 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  total_amount?: number;
}

export class OdooWebhookEventDto {
  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    enum: WebhookEventType,
    example: 'quotation_status_update',
  })
  @IsOptional()
  @Transform(({ value }) => value?.toString()?.trim())
  @IsEnum(WebhookEventType, {
    message: `event_type must be one of: ${Object.values(WebhookEventType).join(', ')}`,
  })
  event_type?: WebhookEventType;

  @ApiPropertyOptional({ type: [WebhookLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookLineDto)
  lines?: WebhookLineDto[];

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  partner_email?: string;

  @ApiPropertyOptional({ example: 29 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  partner_id?: number;

  @ApiPropertyOptional({ example: 'Accountant' })
  @IsOptional()
  @IsString()
  partner_name?: string;

  @ApiPropertyOptional({ example: 'customer' })
  @IsOptional()
  @IsString()
  partner_type?: string;

  @ApiPropertyOptional({ example: '2026-05-08T11:58:41Z' })
  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @ApiPropertyOptional({ example: 1.15 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  total_amount?: number;

  @ApiPropertyOptional({ example: '2026-05-08' })
  @IsOptional()
  @IsDateString()
  due_date?: string;

  @ApiPropertyOptional({ example: '2026-05-08' })
  @IsOptional()
  @IsDateString()
  invoice_date?: string;

  @ApiPropertyOptional({ example: 'INV/2026/00004' })
  @IsOptional()
  @IsString()
  invoice_reference?: string;

  @ApiPropertyOptional({ example: 'out_invoice' })
  @IsOptional()
  @IsString()
  move_type?: string;

  @ApiPropertyOptional({ example: 'not_paid' })
  @IsOptional()
  @IsString()
  payment_state?: string;

  @ApiPropertyOptional({ example: 1.15 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  residual_amount?: number;

  @ApiPropertyOptional({ example: 'posted' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 0.15 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  tax_amount?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  untaxed_amount?: number;

  @ApiPropertyOptional({ example: '2026-05-08T11:58:21' })
  @IsOptional()
  @IsDateString()
  date_order?: string;

  @ApiPropertyOptional({ example: 'sale' })
  @IsOptional()
  @IsString()
  new_status?: string;

  @ApiPropertyOptional({ example: 'draft' })
  @IsOptional()
  @IsString()
  previous_status?: string;

  @ApiPropertyOptional({ example: 'S00021' })
  @IsOptional()
  @IsString()
  quotation_reference?: string;

  @ApiPropertyOptional({ example: 1.15 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ example: 'Bank' })
  @IsOptional()
  @IsString()
  journal?: string;

  @ApiPropertyOptional({ example: 'INV/2026/00004' })
  @IsOptional()
  @IsString()
  memo?: string;

  @ApiPropertyOptional({ example: '2026-05-08' })
  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @ApiPropertyOptional({ example: 'PAY00011' })
  @IsOptional()
  @IsString()
  payment_reference?: string;

  @ApiPropertyOptional({ example: 'inbound' })
  @IsOptional()
  @IsString()
  payment_type?: string;

  @ApiPropertyOptional({ type: [ReconciledInvoiceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReconciledInvoiceDto)
  reconciled_invoices?: ReconciledInvoiceDto[];

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  payment_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  order_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  invoice_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  move_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  quotation_id?: number;

  @ApiPropertyOptional({
    example: [1, 2, 3],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => Number(v)) : []))
  @IsNumber({}, { each: true })
  invoice_ids?: number[];
}

export class CloseServiceWebhookDto {
  @ApiPropertyOptional({
    example: 'close_service',
  })
  @IsOptional()
  @IsString()
  close_service_event_type?: string;

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_closed?: boolean;

  @ApiPropertyOptional({
    example: 163,
  })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  order_id?: number;

  @ApiPropertyOptional({
    example: [109],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @Transform(({ value }) => (Array.isArray(value) ? value.map((v) => Number(v)) : []))
  @IsNumber({}, { each: true })
  picking_ids?: number[];

  @ApiPropertyOptional({
    example: 'S00172',
  })
  @IsOptional()
  @IsString()
  order_name?: string;

  @ApiPropertyOptional({
    example: 72,
  })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  partner_id?: number;

  @ApiPropertyOptional({
    example: 'Test First Name Test Second Name',
  })
  @IsOptional()
  @IsString()
  partner_name?: string;

  @ApiPropertyOptional({
    example: 0,
  })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  session?: number;

  @ApiPropertyOptional({
    example: 0,
  })
  @IsOptional()
  @ToNumber()
  @IsNumber()
  sessions_completed?: number;

  @ApiPropertyOptional({
    example: '2026-05-19T08:39:18Z',
  })
  @IsOptional()
  @IsDateString()
  timestamp?: string;
}

export class OdooWebhookHandleDto extends PartialType(IntersectionType(OdooWebhookEventDto, CloseServiceWebhookDto)) {}
