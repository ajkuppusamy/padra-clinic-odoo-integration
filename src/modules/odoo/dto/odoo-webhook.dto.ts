import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class BaseEventDto {
  @ApiPropertyOptional({
    enum: ['quotation_status_update', 'invoice_created', 'payment_created', 'refund_credit_note', 'payment_link_tabi_tamara', 'product_create', 'product_update'],
    description: 'Event type',
  })
  @IsOptional()
  @IsString()
  event?: string;

  @ApiPropertyOptional({ example: '2024-01-15T10:30:00Z' })
  @IsOptional()
  @IsString()
  timestamp?: string;
}

export class QuotationStatusUpdateEventDto extends BaseEventDto {
  @ApiPropertyOptional({ example: 'QUO-001' })
  @IsOptional()
  @IsString()
  quotation_id?: string;

  @ApiPropertyOptional({ example: 'REF-2024-001' })
  @IsOptional()
  @IsString()
  quotation_reference?: string;

  @ApiPropertyOptional({ example: 'CONTACT-123' })
  @IsOptional()
  @IsString()
  contact_id?: string;

  @ApiPropertyOptional({ enum: ['draft', 'confirmed', 'done', 'cancel'], example: 'draft' })
  @IsOptional()
  @IsString()
  previous_status?: string;

  @ApiPropertyOptional({ enum: ['draft', 'confirmed', 'done', 'cancel'], example: 'confirmed' })
  @IsOptional()
  @IsString()
  new_status?: string;

  @ApiPropertyOptional({ example: 1500.0 })
  @IsOptional()
  @IsNumber()
  total_amount?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: ['odoo_ui', 'api'], example: 'api' })
  @IsOptional()
  @IsString()
  source?: string;
}

// Invoice Created Event
export class InvoiceCreatedEventDto extends QuotationStatusUpdateEventDto {
  @ApiPropertyOptional({ example: 'INV-2024-001' })
  @IsOptional()
  @IsString()
  invoice_id?: string;

  @ApiPropertyOptional({ example: 'INV-REF-001' })
  @IsOptional()
  @IsString()
  invoice_reference?: string;

  @ApiPropertyOptional({ example: '2024-01-15' })
  @IsOptional()
  @IsString()
  invoice_date?: string;

  @ApiPropertyOptional({ example: '2024-02-15' })
  @IsOptional()
  @IsString()
  due_date?: string;

  @ApiPropertyOptional({ enum: ['not_paid', 'partial', 'paid'], example: 'not_paid' })
  @IsOptional()
  @IsString()
  payment_status?: string;
}

// Payment Created Event
export class PaymentCreatedEventDto extends InvoiceCreatedEventDto {
  @ApiPropertyOptional({ example: 'TXN-456' })
  @IsOptional()
  @IsString()
  transaction_id?: string;

  @ApiPropertyOptional({ enum: ['tabi', 'tamara', 'cash', 'bank_transfer', 'credit_card'], example: 'credit_card' })
  @IsOptional()
  @IsString()
  payment_method?: string;

  @ApiPropertyOptional({ example: 1500.0 })
  @IsOptional()
  @IsNumber()
  amount_paid?: number;

  @ApiPropertyOptional({ example: '2024-01-15' })
  @IsOptional()
  @IsString()
  payment_date?: string;
}

// Refund Credit Note Event
export class RefundCreditNoteEventDto extends PaymentCreatedEventDto {
  @ApiPropertyOptional({ example: 'REF-001' })
  @IsOptional()
  @IsString()
  refund_id?: string;

  @ApiPropertyOptional({ example: '2024-01-20' })
  @IsOptional()
  @IsString()
  refund_date?: string;

  @ApiPropertyOptional({ example: 500.0 })
  @IsOptional()
  @IsNumber()
  refund_amount?: number;

  @ApiPropertyOptional({ example: 'Customer return' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ example: 'INV-2024-001' })
  @IsOptional()
  @IsString()
  original_invoice_id?: string;
}

// Payment Link Tabi Tamara Event
export class PaymentLinkTabiTamaraEventDto extends RefundCreditNoteEventDto {
  @ApiPropertyOptional({ example: 'https://payment.link/xyz', nullable: true })
  @IsOptional()
  @IsString()
  payment_link_url?: string | null;

  @ApiPropertyOptional({ example: 1500.0 })
  @IsOptional()
  @IsNumber()
  amount?: number;
}

// Product Event (for both create and update)
export class ProductEventDto extends PaymentLinkTabiTamaraEventDto {
  @ApiPropertyOptional({ example: 123 })
  @IsOptional()
  @IsNumber()
  id?: number;

  @ApiPropertyOptional({ example: 'PROD-0e3wssw' })
  @IsOptional()
  @IsString()
  product_id?: string;

  @ApiPropertyOptional({ example: 'Sample Product' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 100.0 })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ example: 'PROD-001' })
  @IsOptional()
  @IsString()
  default_code?: string;

  @ApiPropertyOptional({ example: 'Product description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  qty_available?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class OdooWebhookDto extends ProductEventDto {}
