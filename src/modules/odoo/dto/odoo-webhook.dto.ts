import { WebhookEventType } from '@libs/odoo/enums';
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class WebhookLineDto {
  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  default_code?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  price_subtotal?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  price_unit?: number;

  @ApiPropertyOptional({ example: 395 })
  @IsOptional()
  @IsNumber()
  product_id?: number;

  @ApiPropertyOptional({ example: 'BRAUN HAIR TRIMER' })
  @IsOptional()
  @IsString()
  product_name?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
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
  @IsNumber()
  residual_amount?: number;

  @ApiPropertyOptional({ example: 1.15 })
  @IsOptional()
  @IsNumber()
  total_amount?: number;
}

export class OdooWebhookEventDto {
  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: WebhookEventType })
  @IsOptional()
  @IsEnum(WebhookEventType)
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
  @IsNumber()
  total_amount?: number;

  // Invoice

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
  @IsNumber()
  residual_amount?: number;

  @ApiPropertyOptional({ example: 'posted' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 0.15 })
  @IsOptional()
  @IsNumber()
  tax_amount?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  untaxed_amount?: number;

  // Quotation

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

  // Payment

  @ApiPropertyOptional({ example: 1.15 })
  @IsOptional()
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

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  @IsNumber()
  id?: number | string;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsNumber()
  payment_id?: number;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsNumber()
  order_id?: number;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsNumber()
  invoice_id?: number;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsNumber()
  move_id?: number;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsNumber()
  quoation_id?: number;

  @ApiPropertyOptional({
    example: [1, 2, 3],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  invoice_ids?: number[];
}
// new
export class OdooWebhookHandleDto extends PartialType(OdooWebhookEventDto) {}
