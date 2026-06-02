import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceDeploymentMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpsertEnvironmentServiceTargetItemDto {
  @ApiProperty({ example: 'service-uuid' })
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @ApiProperty({ example: 'server-uuid' })
  @IsString()
  @IsNotEmpty()
  serverId!: string;

  @ApiPropertyOptional({
    enum: ServiceDeploymentMode,
    example: ServiceDeploymentMode.DOCKER_COMPOSE,
  })
  @IsOptional()
  @IsEnum(ServiceDeploymentMode)
  deploymentMode?: ServiceDeploymentMode;

  @ApiPropertyOptional({ example: 3000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  port?: number;

  @ApiPropertyOptional({ example: 'api-staging.example.com' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ example: '/health' })
  @IsOptional()
  @IsString()
  healthcheckPath?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  replicas?: number;
}

export class UpsertEnvironmentServiceTargetsDto {
  @ApiProperty({ type: [UpsertEnvironmentServiceTargetItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpsertEnvironmentServiceTargetItemDto)
  targets!: UpsertEnvironmentServiceTargetItemDto[];
}
