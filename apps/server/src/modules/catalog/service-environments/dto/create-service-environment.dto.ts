import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BuildPack } from '@prisma/client';
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

export class CreateServiceEnvironmentDto {
  @ApiProperty({ example: 'service-uuid' })
  @IsString()
  @IsNotEmpty({ message: 'serviceId est requis' })
  serviceId!: string;

  @ApiProperty({ example: 'environment-uuid' })
  @IsString()
  @IsNotEmpty({ message: 'environmentId est requis' })
  environmentId!: string;

  @ApiPropertyOptional({
    example: 'server-uuid',
    description:
      'Serveur cible explicite de ce service-env (sinon : 1er serveur de l’environnement).',
  })
  @IsOptional()
  @IsString()
  serverId?: string;

  @ApiPropertyOptional({ example: 'develop' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional({ example: 4000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  port?: number;

  @ApiPropertyOptional({ example: 'npm run start:staging' })
  @IsOptional()
  @IsString()
  startCommand?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  replicas?: number;

  @ApiPropertyOptional({ example: '/health' })
  @IsOptional()
  @IsString()
  healthcheckPath?: string;

  @ApiPropertyOptional({ enum: BuildPack, example: BuildPack.DOCKERFILE })
  @IsOptional()
  @IsEnum(BuildPack)
  buildPack?: BuildPack;

  @ApiPropertyOptional({ example: '{"NODE_ENV":"staging"}' })
  @IsOptional()
  @IsString()
  env?: string;

  @ApiPropertyOptional({
    description:
      'Secret variables as JSON. Encrypted at rest; never returned by the API.',
    example: '{"DB_PASSWORD":"s3cr3t"}',
  })
  @IsOptional()
  @IsString()
  secretsEnv?: string;

  @ApiPropertyOptional({
    description: 'Déploiement auto sur push (via webhook).',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  autoDeploy?: boolean;

  @ApiPropertyOptional({
    description: 'Branche déclenchant le déploiement auto.',
    example: 'main',
  })
  @IsOptional()
  @IsString()
  autoBranch?: string;
}
