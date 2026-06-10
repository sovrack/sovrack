import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateDeploymentDto {
  @ApiProperty({ example: 'project-uuid' })
  @IsString({ message: 'projectId doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'projectId est obligatoire' })
  projectId!: string;

  @ApiPropertyOptional({ example: 'service-uuid' })
  @IsOptional()
  @IsString({ message: 'serviceId doit être une chaîne de caractères' })
  serviceId?: string;

  @ApiProperty({ example: 'environment-uuid' })
  @IsString({ message: 'environmentId doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'environmentId est obligatoire' })
  environmentId!: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString({ message: 'La branche doit être une chaîne de caractères' })
  branch?: string;

  @ApiPropertyOptional({
    example: 42,
    description:
      'Repository GitLab ciblé (recommandé pour source GROUP, optionnel pour REPO)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'repoId doit être un entier positif' })
  @Min(1, { message: 'repoId doit être supérieur à 0' })
  repoId?: number;

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
    description: [
      'Source de build — un seul champ remplace buildPack + buildMode :',
      '  DOCKERFILE_REGISTRY — Dockerfile buildé par CI GitLab/GitHub → registry → pull sur VPS',
      '  DOCKERFILE_LOCAL    — Dockerfile buildé directement sur le VPS (pas de registry)',
      '  NIXPACKS_REGISTRY   — Nixpacks buildé par CI → registry → pull sur VPS',
      '  NIXPACKS_LOCAL      — Nixpacks buildé directement sur le VPS',
      '  DOCKER_COMPOSE      — docker-compose.yml exécuté sur le VPS',
      '  STATIC              — Site statique servi par Nginx sur le VPS',
      '  EXTERNAL_IMAGE      — Image Docker externe fournie via overrideImage',
    ].join('\n'),
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
  overrideImage?: string;

  /**
   * Nixpacks-specific configuration (used when buildStrategy=NIXPACKS).
   */
  @ApiPropertyOptional({
    description: 'Nixpacks configuration: build env, runtime env, port, etc.',
    example: {
      buildEnv: { NODE_ENV: 'production' },
      runtimeEnv: { PORT: '3000' },
      port: 3000,
    },
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

  /**
   * Static site configuration (used when buildStrategy=STATIC).
   */
  @ApiPropertyOptional({
    description: 'Static site configuration: source dir, build cmd, SPA mode, etc.',
    example: {
      sourceDir: 'dist',
      buildCommand: 'npm run build',
      spaFallback: true,
    },
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
