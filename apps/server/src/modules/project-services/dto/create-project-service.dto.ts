import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BuildPack, ProjectServiceType } from '@prisma/client';
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
    enum: BuildPack,
    example: 'DOCKERFILE',
  })
  @IsOptional()
  @IsEnum(BuildPack)
  buildPack?: BuildPack;

  @ApiPropertyOptional({ example: 'Dockerfile' })
  @IsOptional()
  @IsString()
  dockerfilePath?: string;

  @ApiPropertyOptional({ example: 'api' })
  @IsOptional()
  @IsString()
  composeServiceName?: string;

  @ApiPropertyOptional({ example: 'version: "3.8"\nservices:\n...' })
  @IsOptional()
  @IsString()
  dockerComposeContent?: string;

  @ApiPropertyOptional({ example: { installCommand: 'npm install' } })
  @IsOptional()
  @IsObject()
  nixpacksConfig?: any;

  @ApiPropertyOptional({ example: { outputFolder: 'dist' } })
  @IsOptional()
  @IsObject()
  staticConfig?: any;
}
