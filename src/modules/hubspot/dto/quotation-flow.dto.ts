import { IsNumber, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum PaymentMethod {
  // Card Payment Methods
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',

  // Cash Payment Method
  CASH = 'CASH',

  // Online Paymnet Methods
  IFINANCE = 'IFINANCE',
  BEAUTIFI = 'BEAUTIFI',
}

export class Quotation {
  @ApiProperty({ example: 12345 })
  @Type(() => Number)
  @IsNumber()
  dealId!: number;

  @ApiProperty({
    enum: PaymentMethod,
    example: PaymentMethod.CREDIT,
  })
  @IsEnum(PaymentMethod, {
    message: `paymentMethod must be one of: ${Object.values(PaymentMethod).join(', ')}`,
  })
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ example: 5000 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ example: 98765 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  quoteId?: number;
}
