import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProxyCertType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { IsDomainName } from '../../shared/domain-name.validator';

export class CreateProxyRuleDto {
  @ApiProperty({ example: 'app.example.com' })
  @IsString()
  @IsNotEmpty()
  @IsDomainName()
  domain: string;

  @ApiProperty({ example: 3000 })
  @IsInt()
  @Min(1)
  @Max(65535)
  targetPort: number;

  @ApiProperty({ example: 'srv_xxx' })
  @IsString()
  @IsNotEmpty()
  serverId: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  sslEnabled?: boolean;

  @ApiPropertyOptional({
    enum: ProxyCertType,
    default: ProxyCertType.LETS_ENCRYPT,
  })
  @IsOptional()
  @IsEnum(ProxyCertType)
  certType?: ProxyCertType;

  @ApiPropertyOptional({ example: 'service_env-uuid' })
  @IsOptional()
  @IsString()
  serviceEnvId?: string;
}

export class UpdateProxyRuleDto {
  @ApiPropertyOptional({ example: 3001 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  targetPort?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  sslEnabled?: boolean;

  @ApiPropertyOptional({ enum: ProxyCertType })
  @IsOptional()
  @IsEnum(ProxyCertType)
  certType?: ProxyCertType;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
