import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsNumber,
  Max,
  Min,
  IsNotEmpty,
  IsString,
  IsIn,
} from 'class-validator';

/**
 * Handles pagination query parameters from API requests
 */
export class PaginationDto {
  @ApiPropertyOptional({ example: 1, description: 'Current page number' })
  @Transform(({ value }) => Number(value))
  @Min(1, { message: 'Page number must be at least 1' })
  @IsNotEmpty({ message: 'Page number is required' })
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({
    example: 100,
    description: 'Number of records per page',
  })
  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsNumber()
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number = 100;

  @ApiPropertyOptional({
    example: 'createdAt',
    description: 'Field name to sort by (e.g. createdAt, updatedAt, name)',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    example: 'asc',
    description: 'Sort order: asc (ascending) or desc (descending)',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsIn(['asc', 'desc', 'ASC', 'DESC'])
  @Transform(({ value }) => value?.toUpperCase())
  sortOrder?: 'asc' | 'desc';
}
