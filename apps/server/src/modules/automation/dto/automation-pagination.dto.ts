import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors shared/http/pagination.dto.ts's validation, but keeps the field
// name `pageSize` (not `limit`) — the response shape this service returns
// ({items, total, page, pageSize}) is an established frontend contract
// (features/automation/types/automation.ts) left untouched here; see B7 for
// the frontend-side pagination unification, which normalizes consumption
// without changing this backend shape.
export class AutomationPaginationDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
