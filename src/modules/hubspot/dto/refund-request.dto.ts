import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class RefundRequestDto {
  @ApiProperty({ enum: ['full', 'partial'] })
  @IsIn(['full', 'partial'])
  refundType!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  salesOrder!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;
}
