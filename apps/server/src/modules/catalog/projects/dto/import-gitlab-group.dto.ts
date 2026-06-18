import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export type GitlabGroupImportMode = 'ONE_APPLICATION' | 'SEPARATE_PROJECTS';

export class GitlabGroupImportRepositoryDto {
  @ApiProperty({ example: 123456 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id!: number;

  @ApiProperty({ example: 'frontend' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'company/my-app/frontend' })
  @IsString()
  @IsNotEmpty()
  pathWithNamespace!: string;

  @ApiProperty({ example: 'main' })
  @IsString()
  @IsNotEmpty()
  defaultBranch!: string;

  @ApiPropertyOptional({ example: 'frontend' })
  @IsOptional()
  @IsString()
  serviceName?: string;

  @ApiPropertyOptional({ enum: ServiceType })
  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;
}

export class ImportGitlabGroupDto {
  @ApiProperty({ example: 'my-app' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'Application imported from GitLab group' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'provider-uuid' })
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({ example: 'https://gitlab.com' })
  @IsOptional()
  @IsUrl()
  gitlabUrl?: string;

  @ApiPropertyOptional({ example: 'glpat-xxxxxxxxxxxxxxxxxxxx' })
  @IsOptional()
  @IsString()
  gitlabToken?: string;

  @ApiProperty({ example: 'company/my-apps' })
  @IsString()
  @IsNotEmpty()
  groupId!: string;

  @ApiProperty({
    enum: ['ONE_APPLICATION', 'SEPARATE_PROJECTS'],
    example: 'ONE_APPLICATION',
  })
  @IsIn(['ONE_APPLICATION', 'SEPARATE_PROJECTS'])
  importMode!: GitlabGroupImportMode;

  @ApiProperty({ type: [GitlabGroupImportRepositoryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GitlabGroupImportRepositoryDto)
  repositories!: GitlabGroupImportRepositoryDto[];

  @ApiPropertyOptional({
    example: '0fca8a5f-4f31-43fc-a5a8-d4f07102e8dd',
    description: 'DEVELOPER user to assign as OWNER',
  })
  @IsOptional()
  @IsUUID('4')
  ownerId?: string;
}
