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
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  default_code?: string;

  @ApiPropertyOptional({ example: 100 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  price_subtotal?: number;

  @ApiPropertyOptional({ example: 100 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  price_unit?: number;

  @ApiPropertyOptional({ example: 586 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  product_id?: number;

  @ApiPropertyOptional({ example: 'Hair Transplant' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  product_name?: string;

  @ApiPropertyOptional({ example: 1 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  quantity?: number;
}

export class ReconciledInvoiceDto {
  @ApiPropertyOptional({ example: 'INV/2026/00004' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  invoice_reference?: string;

  @ApiPropertyOptional({ example: 'in_payment' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  payment_state?: string;

  @ApiPropertyOptional({ example: 100 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  residual_amount?: number;

  @ApiPropertyOptional({ example: 115 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  total_amount?: number;
}

export class OdooWebhookEventDto {
  // Common

  @ApiPropertyOptional({ example: 'KWD' })
  @Transform(({ value }) => (value === '' ? undefined : value))
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
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsEmail()
  partner_email?: string;

  @ApiPropertyOptional({ example: 89 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  partner_id?: number;

  @ApiPropertyOptional({ example: 'Test Customer' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  partner_name?: string;

  @ApiPropertyOptional({ example: 'customer' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  partner_type?: string;

  @ApiPropertyOptional({ example: '2026-05-20T10:33:52Z' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @ApiPropertyOptional({ example: 11500 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  total_amount?: number;

  // Invoice

  @ApiPropertyOptional({ example: '2026-05-20' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsDateString()
  due_date?: string;

  @ApiPropertyOptional({ example: '2026-05-20' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsDateString()
  invoice_date?: string;

  @ApiPropertyOptional({ example: 'INV/2026/00077' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  invoice_reference?: string;

  @ApiPropertyOptional({ example: 'out_invoice' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  move_type?: string;

  @ApiPropertyOptional({ example: 'not_paid' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  payment_state?: string;

  @ApiPropertyOptional({ example: 11500 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  residual_amount?: number;

  @ApiPropertyOptional({ example: 'posted' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 1500 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  tax_amount?: number;

  @ApiPropertyOptional({ example: 10000 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  untaxed_amount?: number;

  // Quotation

  @ApiPropertyOptional({ example: '2026-05-20T08:32:08Z' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsDateString()
  date_order?: string;

  @ApiPropertyOptional({ example: 'sale' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  new_status?: string;

  @ApiPropertyOptional({ example: 'draft' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  previous_status?: string;

  @ApiPropertyOptional({ example: 'S00209' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  quotation_reference?: string;

  // Payment

  @ApiPropertyOptional({ example: 9525 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ example: 'Bank' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  journal?: string;

  @ApiPropertyOptional({ example: 'Payment memo' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  memo?: string;

  @ApiPropertyOptional({ example: '2026-05-20' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @ApiPropertyOptional({ example: 'PBNK1/2026/00060' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  payment_reference?: string;

  @ApiPropertyOptional({ example: 'inbound' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  payment_type?: string;

  @ApiPropertyOptional({ type: [ReconciledInvoiceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReconciledInvoiceDto)
  reconciled_invoices?: ReconciledInvoiceDto[];

  // IDs

  @ApiPropertyOptional({ example: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  id?: number;

  @ApiPropertyOptional({ example: 94 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  payment_id?: number;

  @ApiPropertyOptional({ example: 209 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  order_id?: number;

  @ApiPropertyOptional({ example: 306 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  invoice_id?: number;

  @ApiPropertyOptional({ example: 306 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  move_id?: number;

  @ApiPropertyOptional({ example: 199 })
  @Type(() => Number)
  @IsOptional()
  @ToNumber()
  @IsNumber()
  quotation_id?: number;

  @ApiPropertyOptional({
    example: [1, 2, 3],
    type: [Number],
  })
  @Type(() => Number)
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
