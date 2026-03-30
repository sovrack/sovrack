import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateConfigDto {
  @ApiPropertyOptional({ example: 'REDIS_URL' })
  @IsOptional()
  @IsString({ message: 'La clé doit être une chaîne de caractères' })
  key?: string;

  @ApiPropertyOptional({ example: 'redis://localhost:6379' })
  @IsOptional()
  @IsString({ message: 'La valeur doit être une chaîne de caractères' })
  value?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'isSecret doit être un booléen' })
  isSecret?: boolean;
}
