import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BuildStrategy, ProjectServiceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateProjectServiceDto {
  @ApiProperty({ example: 'frontend' })
  @IsString({ message: 'Le nom du service doit être une chaîne' })
  @IsNotEmpty({ message: 'Le nom du service est requis' })
  name!: string;

  @ApiPropertyOptional({
    enum: ProjectServiceType,
    example: ProjectServiceType.FRONTEND,
  })
  @IsOptional()
  @IsEnum(ProjectServiceType)
  type?: ProjectServiceType;

  @ApiPropertyOptional({ example: 'git-provider-uuid' })
  @IsOptional()
  @IsString()
  sourceProviderId?: string;

  @ApiPropertyOptional({ example: 123456 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  gitlabProjectId?: number;

  @ApiPropertyOptional({ example: 'company/my-app/frontend' })
  @IsOptional()
  @IsString()
  repositoryPath?: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  defaultBranch?: string;

  @ApiPropertyOptional({
    enum: BuildStrategy,
    example: BuildStrategy.DOCKERFILE,
  })
  @IsOptional()
  @IsEnum(BuildStrategy)
  buildStrategy?: BuildStrategy;

  @ApiPropertyOptional({ example: 'Dockerfile' })
  @IsOptional()
  @IsString()
  dockerfilePath?: string;

  @ApiPropertyOptional({ example: 'api' })
  @IsOptional()
  @IsString()
  composeServiceName?: string;
}
