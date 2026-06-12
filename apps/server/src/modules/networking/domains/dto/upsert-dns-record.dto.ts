import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DnsRecordType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpsertDnsRecordDto {
  @ApiProperty({ enum: DnsRecordType, example: DnsRecordType.A })
  @IsEnum(DnsRecordType)
  type!: DnsRecordType;

  @ApiProperty({ example: 'api-staging' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '203.0.113.10' })
  @IsString()
  @IsNotEmpty()
  value!: string;

  @ApiPropertyOptional({ example: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  ttl?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  proxied?: boolean;

  @ApiPropertyOptional({ example: 'service_env-uuid' })
  @IsOptional()
  @IsString()
  serviceEnvId?: string;
}
