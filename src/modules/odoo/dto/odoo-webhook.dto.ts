//odoo-webhook.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class BaseEventDto {
  @ApiProperty({
    enum: ['quotation_status_update', 'invoice_created', 'payment_created', 'refund_credit_note', 'payment_link_tabi_tamara', 'product_create', 'product_update'],
    description: 'Event type',
  })
  event?: string;

  @ApiPropertyOptional({ example: '2024-01-15T10:30:00Z' })
  timestamp?: string;
}

export class QuotationStatusUpdateEventDto extends BaseEventDto {
  @ApiProperty({ example: 'QUO-001', required: false })
  quotation_id?: string;

  @ApiProperty({ example: 'REF-2024-001', required: false })
  quotation_reference?: string;

  @ApiProperty({ example: 'CONTACT-123', required: false })
  contact_id?: string;

  @ApiProperty({ enum: ['draft', 'confirmed', 'done', 'cancel'], example: 'draft', required: false })
  previous_status?: string;

  @ApiProperty({ enum: ['draft', 'confirmed', 'done', 'cancel'], example: 'confirmed', required: false })
  new_status?: string;

  @ApiProperty({ example: 1500.0, required: false })
  total_amount?: number;

  @ApiProperty({ example: 'USD', required: false })
  currency?: string;

  @ApiProperty({ enum: ['odoo_ui', 'api'], example: 'api', required: false })
  source?: string;
}

// Invoice Created Event
export class InvoiceCreatedEventDto extends QuotationStatusUpdateEventDto {
  @ApiProperty({ example: 'INV-2024-001', required: false })
  invoice_id?: string;

  @ApiProperty({ example: 'INV-REF-001', required: false })
  invoice_reference?: string;

  @ApiProperty({ example: '2024-01-15', required: false })
  invoice_date?: string;

  @ApiProperty({ example: '2024-02-15', required: false })
  due_date?: string;

  @ApiProperty({ enum: ['not_paid', 'partial', 'paid'], example: 'not_paid', required: false })
  payment_status?: string;
}

// Payment Created Event
export class PaymentCreatedEventDto extends InvoiceCreatedEventDto {
  @ApiProperty({ example: 'TXN-456', required: false })
  transaction_id?: string;

  @ApiProperty({ enum: ['tabi', 'tamara', 'cash', 'bank_transfer', 'credit_card'], example: 'credit_card', required: false })
  payment_method?: string;

  @ApiProperty({ example: 1500.0, required: false })
  amount_paid?: number;

  @ApiProperty({ example: '2024-01-15', required: false })
  payment_date?: string;
}

// Refund Credit Note Event
export class RefundCreditNoteEventDto extends PaymentCreatedEventDto {
  @ApiProperty({ example: 'REF-001', required: false })
  refund_id?: string;

  @ApiProperty({ example: '2024-01-20', required: false })
  refund_date?: string;

  @ApiProperty({ example: 500.0, required: false })
  refund_amount?: number;

  @ApiProperty({ example: 'Customer return', required: false })
  reason?: string;

  @ApiProperty({ example: 'INV-2024-001', required: false })
  original_invoice_id?: string;
}

// Payment Link Tabi Tamara Event
export class PaymentLinkTabiTamaraEventDto extends RefundCreditNoteEventDto {
  @ApiProperty({ example: 'https://payment.link/xyz', nullable: true, required: false })
  payment_link_url?: string | null;

  @ApiProperty({ example: 1500.0, required: false })
  amount?: number;
}

// Product Event (for both create and update)
export class ProductEventDto extends PaymentLinkTabiTamaraEventDto {
  @IsNumber()
  @IsOptional()
  @ApiProperty({ example: 123, required: false })
  id?: number;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'PROD-0e3wssw', required: false })
  product_id?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ example: 'Sample Product', required: false })
  name?: string;

  @IsNumber()
  @IsOptional()
  @ApiPropertyOptional({ example: 100.0, required: false })
  price?: number;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ example: 'PROD-001', required: false })
  default_code?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ example: 'Product description', required: true })
  description?: string;

  @IsNumber()
  @IsOptional()
  @ApiPropertyOptional({ example: 50, required: false })
  qty_available?: number;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional({ example: true, required: false })
  active?: boolean;
}

export class WebhookDto extends ProductEventDto {}
