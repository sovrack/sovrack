import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
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
    enum: ['registry', 'local', 'compose'],
    example: 'registry',
    description:
      'Mode de build: registry (GitLab CI), local (build sur le VPS) ou compose (déploiement docker-compose)',
  })
  @IsOptional()
  @IsEnum(['registry', 'local', 'compose'], {
    message: 'buildMode doit être "registry", "local" ou "compose"',
  })
  buildMode?: 'registry' | 'local' | 'compose';

  @ApiPropertyOptional({
    example: 'docker.io/myorg/myapp:latest',
    description:
      'Image Docker externe à utiliser (au lieu de construire depuis GitLab)',
  })
  @IsOptional()
  @IsString({ message: 'overrideImage doit être une chaîne de caractères' })
  overrideImage?: string;
}
