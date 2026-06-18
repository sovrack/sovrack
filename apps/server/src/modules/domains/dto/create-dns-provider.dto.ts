import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DnsProviderType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDnsProviderDto {
  @ApiProperty({ example: 'Manual DNS' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: DnsProviderType, example: DnsProviderType.MANUAL })
  @IsEnum(DnsProviderType)
  type!: DnsProviderType;

  @ApiPropertyOptional({ example: 'cloudflare-api-token' })
  @IsOptional()
  @IsString()
  apiToken?: string;

  @ApiPropertyOptional({ example: 'account-id' })
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiPropertyOptional({ example: 'zone-id' })
  @IsOptional()
  @IsString()
  zoneId?: string;
}
