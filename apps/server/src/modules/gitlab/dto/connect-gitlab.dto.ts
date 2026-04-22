import { ApiPropertyOptional } from '@nestjs/swagger';
import { GitlabSourceType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, IsUrl } from 'class-validator';

export class ConnectGitlabDto {
  @ApiPropertyOptional({ example: 'https://gitlab.example.com' })
  @IsOptional()
  @IsUrl()
  gitlabUrl!: string;

  @ApiPropertyOptional({ example: 'glpat-xxxxxxxxxxxxxxxxxxxx' })
  @IsOptional()
  @IsString()
  gitlabToken!: string;

  @ApiPropertyOptional({
    example: 'b5073d11-f378-4c71-87da-093f3ecf20af',
    description:
      'Provider GitLab global (Platform Config). Si fourni, URL/token peuvent être omis.',
  })
  @IsOptional()
  @IsString()
  providerId?: string;

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
