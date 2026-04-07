import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from './pagination.dto';

export class BaseQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    example: 'search text',
    description: 'Search keyword',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
