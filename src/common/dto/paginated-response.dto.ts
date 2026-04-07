import { ApiProperty } from '@nestjs/swagger';

/**
 * Response format for paginated data
 */
export class PaginatedResponseDto<T> {
  @ApiProperty({ description: 'List of records' })
  data: T[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 5 })
  limit: number;

  @ApiProperty({ example: 50 })
  total: number;

  @ApiProperty({ example: 10 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;

  @ApiProperty({ example: false })
  hasPrevPage: boolean;

  @ApiProperty({ example: '2025-11-07T13:10:02.023Z' })
  timestamp: string;

  @ApiProperty({ example: 'Requested Data Fetched Successfully' })
  message: string;

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data;
    this.total = total;
    this.page = page;
    this.limit = limit;
    this.totalPages = Math.ceil(total / limit);
    this.hasNextPage = page < this.totalPages;
    this.hasPrevPage = page > 1;
    this.timestamp = new Date().toISOString();
    this.message = 'Requested Data Fetched Successfully';
  }
}
