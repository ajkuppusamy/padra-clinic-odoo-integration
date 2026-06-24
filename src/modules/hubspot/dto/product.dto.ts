import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator';
import { PaymentMethod } from './quotation-flow.dto';

export class ProductDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  id!: number;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  company_id!: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  list_price!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  base_unit_price!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  price!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  quantity!: number;
}

export class HubspotProductDto {
  @ApiProperty({
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
  })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiProperty({
    type: [ProductDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductDto)
  products!: ProductDto[];

  @ApiPropertyOptional({
    example: 'percentage',
    description: 'Discount type (e.g., percentage or fixed)',
  })
  @IsOptional()
  @IsString()
  discountType?: string;

  @ApiPropertyOptional({
    example: 10,
    description: 'Discount value. Can be a number or string.',
  })
  @IsOptional()
  @ValidateIf((o) => typeof o.discountValue === 'number')
  @IsNumber()
  @ValidateIf((o) => typeof o.discountValue === 'string')
  @IsString()
  discountValue?: number | string;
}
