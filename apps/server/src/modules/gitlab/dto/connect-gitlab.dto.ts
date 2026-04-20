import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GitlabSourceType } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class ConnectGitlabDto {
  @ApiProperty({ example: 'https://gitlab.example.com' })
  @IsUrl()
  @IsNotEmpty()
  gitlabUrl!: string;

  @ApiProperty({ example: 'glpat-xxxxxxxxxxxxxxxxxxxx' })
  @IsString()
  @IsNotEmpty()
  gitlabToken!: string;

  @ApiPropertyOptional({ example: 123 })
  @IsNumber()
  @IsOptional()
  gitlabId?: number;

  @ApiPropertyOptional({ example: 'main', default: 'main' })
  @IsString()
  @IsOptional()
  defaultBranch?: string;

  @ApiPropertyOptional({
    enum: GitlabSourceType,
    default: GitlabSourceType.REPO,
  })
  @IsEnum(GitlabSourceType)
  @IsOptional()
  sourceType?: GitlabSourceType;

  @ApiPropertyOptional({ example: 44, description: 'Group ID GitLab' })
  @IsNumber()
  @IsOptional()
  gitlabGroupId?: number;

  @ApiPropertyOptional({ example: 'gitlab+deploy-token-12' })
  @IsString()
  @IsOptional()
  deployTokenUsername?: string;

  @ApiPropertyOptional({ example: 'glrt-xxxxxxxxxxxxxxxxxxxx' })
  @IsString()
  @IsOptional()
  deployTokenValue?: string;

  @ApiPropertyOptional({ example: 'registry.gitlab.example.com' })
  @IsString()
  @IsOptional()
  registryUrl?: string;
}
