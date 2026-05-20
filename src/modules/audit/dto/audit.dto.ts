import { Flow, QueueStatus, QueueType, SourceType } from '@common/entities';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, isBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class WebhookAuditDto {
  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  jobId?: string;

  @ApiPropertyOptional({ example: '98765' })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional({ enum: QueueStatus })
  @IsOptional()
  @IsEnum(QueueStatus)
  status?: QueueStatus;

  @ApiPropertyOptional({ enum: QueueType })
  @IsOptional()
  @IsEnum(QueueType)
  queueType?: QueueType;

  @ApiPropertyOptional({ enum: SourceType })
  @IsOptional()
  @IsEnum(SourceType)
  sourceType?: SourceType;

  @ApiPropertyOptional({ example: 'deal.created' })
  @IsOptional()
  @IsString()
  event?: string;

  @ApiPropertyOptional({ enum: Flow })
  @IsOptional()
  @IsEnum(Flow)
  flow?: Flow;

  @ApiPropertyOptional({ type: Boolean, example: false })
  @IsOptional()
  @IsBoolean()
  isRequest?: boolean;

  @ApiPropertyOptional({ type: Boolean, example: false })
  @IsOptional()
  @IsBoolean()
  isResponse?: boolean;

  @ApiPropertyOptional({ example: '2026-05-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-05-20T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;
}
