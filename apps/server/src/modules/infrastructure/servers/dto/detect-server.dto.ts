import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class DetectServerDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  refreshTools?: boolean;
}
