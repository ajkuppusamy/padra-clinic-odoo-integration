import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

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
}
