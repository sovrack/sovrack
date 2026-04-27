import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RetryServerPreparationDto {
  @ApiPropertyOptional({
    example: 'Retry after firewall package mirror outage',
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
