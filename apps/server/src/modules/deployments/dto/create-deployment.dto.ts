import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateDeploymentDto {
  @ApiProperty({ example: 'service-env-uuid' })
  @IsString({ message: 'serviceEnvId doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'serviceEnvId est obligatoire' })
  serviceEnvId!: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString({ message: 'La branche doit être une chaîne de caractères' })
  branch?: string;

  @ApiPropertyOptional({
    enum: ['standard', 'blue-green'],
    example: 'standard',
    description:
      'Strategy de déploiement: standard (simple restart) ou blue-green (zero-downtime)',
  })
  @IsOptional()
  @IsEnum(['standard', 'blue-green'], {
    message: 'strategy doit être "standard" ou "blue-green"',
  })
  strategy?: 'standard' | 'blue-green';

  @ApiPropertyOptional({
    enum: [
      'DOCKERFILE_REGISTRY',
      'DOCKERFILE_LOCAL',
      'NIXPACKS_REGISTRY',
      'NIXPACKS_LOCAL',
      'DOCKER_COMPOSE',
      'STATIC',
      'EXTERNAL_IMAGE',
    ],
    example: 'DOCKERFILE_LOCAL',
  })
  @IsOptional()
  @IsEnum(
    [
      'DOCKERFILE_REGISTRY',
      'DOCKERFILE_LOCAL',
      'NIXPACKS_REGISTRY',
      'NIXPACKS_LOCAL',
      'DOCKER_COMPOSE',
      'STATIC',
      'EXTERNAL_IMAGE',
    ],
    { message: 'buildSource invalide' },
  )
  buildSource?:
    | 'DOCKERFILE_REGISTRY'
    | 'DOCKERFILE_LOCAL'
    | 'NIXPACKS_REGISTRY'
    | 'NIXPACKS_LOCAL'
    | 'DOCKER_COMPOSE'
    | 'STATIC'
    | 'EXTERNAL_IMAGE';

  @ApiPropertyOptional({
    example: 'docker.io/myorg/myapp:latest',
    description: 'Image Docker externe (obligatoire si buildSource=EXTERNAL_IMAGE)',
  })
  @IsOptional()
  @IsString({ message: 'overrideImage doit être une chaîne de caractères' })
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._\/-]*(?::[a-zA-Z0-9._-]+)?$/, {
    message: 'overrideImage doit être un nom d\'image Docker valide (ex: docker.io/nginx:latest)',
  })
  overrideImage?: string;

  @ApiPropertyOptional({
    description: 'Nixpacks configuration: build env, runtime env, port, etc.',
  })
  @IsOptional()
  @IsObject()
  nixpacksConfig?: {
    buildEnv?: Record<string, string>;
    runtimeEnv?: Record<string, string>;
    buildCommand?: string;
    startCommand?: string;
    port?: number;
    nixpacksVersion?: string;
  };

  @ApiPropertyOptional({
    description: 'Static site configuration: source dir, build cmd, SPA mode, etc.',
  })
  @IsOptional()
  @IsObject()
  staticConfig?: {
    sourceDir?: string;
    buildCommand?: string;
    buildDir?: string;
    spaFallback?: boolean;
    page404?: string;
  };
}
