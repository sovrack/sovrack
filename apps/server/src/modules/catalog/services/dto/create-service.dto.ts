import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BuildPack, GitProviderType, ManagedServiceType, ServiceType, SourceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class SourceConnectionDto {
  @ApiProperty({ enum: GitProviderType })
  @IsEnum(GitProviderType)
  provider!: GitProviderType;

  @ApiProperty({ example: 'group/project' })
  @IsString()
  @IsNotEmpty()
  repoPath!: string;

  @ApiProperty({ example: 'glpat-xxx' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  branch?: string;
}

export class CreateServiceDto {
  @ApiProperty({ example: 'api' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du service est requis' })
  name!: string;

  @ApiPropertyOptional({ enum: ServiceType, example: ServiceType.APPLICATION })
  @IsOptional()
  @IsEnum(ServiceType)
  type?: ServiceType;

  @ApiPropertyOptional({ example: 'Backend API NestJS' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: SourceType, example: SourceType.GIT })
  @IsOptional()
  @IsEnum(SourceType)
  sourceType?: SourceType;

  @ApiPropertyOptional({ example: 'org/repo' })
  @IsOptional()
  @IsString()
  repoPath?: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional({ example: 'git-provider-uuid' })
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({ example: '/' })
  @IsOptional()
  @IsString()
  rootDir?: string;

  @ApiPropertyOptional({ enum: BuildPack, example: BuildPack.DOCKERFILE })
  @IsOptional()
  @IsEnum(BuildPack)
  buildPack?: BuildPack;

  @ApiPropertyOptional({ example: 'railpack' })
  @IsOptional()
  @IsString()
  buildType?: string;

  @ApiPropertyOptional({ example: 'FROM node:20\nWORKDIR /app\n...' })
  @IsOptional()
  @IsString()
  dockerfile?: string;

  @ApiPropertyOptional({ example: 3000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  port?: number;

  @ApiPropertyOptional({ example: 'npm run start:prod' })
  @IsOptional()
  @IsString()
  startCommand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  buildArgs?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  nixpacksConfig?: any;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  staticConfig?: any;

  @ApiPropertyOptional({ example: 'version: "3.8"\nservices:\n  api:\n...' })
  @IsOptional()
  @IsString()
  dockerComposeContent?: string;

  @ApiPropertyOptional({ example: 'api' })
  @IsOptional()
  @IsString()
  composeServiceName?: string;

  @ApiPropertyOptional({ enum: ManagedServiceType, example: ManagedServiceType.POSTGRES })
  @IsOptional()
  @IsEnum(ManagedServiceType)
  databaseType?: ManagedServiceType;

  @ApiPropertyOptional({ example: '16' })
  @IsOptional()
  @IsString()
  databaseVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  databaseCredentials?: Record<string, string>;

  @ApiPropertyOptional({ example: '{"NODE_ENV":"production"}' })
  @IsOptional()
  @IsString()
  env?: string;

  @ApiPropertyOptional({ example: '/health' })
  @IsOptional()
  @IsString()
  healthcheckPath?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  replicas?: number;

  @ApiPropertyOptional({ description: 'Source connection (GitLab/GitHub) on creation' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SourceConnectionDto)
  source?: SourceConnectionDto;
}
