import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
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
  products!: ProductDto[];
}
