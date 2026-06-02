import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertEnvConfigDto {
  @ApiProperty({ example: 'DATABASE_URL' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({ example: 'postgresql://user:pass@prod-host:5432/db' })
  @IsString()
  @IsNotEmpty()
  value!: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isSecret?: boolean;
}
