import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppSourceType, GitProviderType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';

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

  @ApiPropertyOptional({
    example: 'group/project',
    type: String,
    description: 'Repository path "group/project" (recommended, provider-agnostic) or numeric ID.',
  })
  @IsOptional()
  gitlabId?: number | string;

  @ApiPropertyOptional({ example: 'main', default: 'main' })
  @IsString()
  @IsOptional()
  defaultBranch?: string;

  @ApiPropertyOptional({
    enum: AppSourceType,
    default: AppSourceType.REPO,
  })
  @IsEnum(AppSourceType)
  @IsOptional()
  sourceType?: AppSourceType;

  @ApiPropertyOptional({
    example: 'my-group/subgroup',
    description: 'Group ID numerique ou chemin GitLab',
    type: String,
  })
  @IsOptional()
  gitlabGroupId?: number | string;

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

/**
 * DTO unifié pour connecter une source (GitLab ou GitHub) à un projet.
 * Utilisé par l'endpoint POST /projects/:id/source/connect.
 */
export class ConnectSourceDto {
  @ApiProperty({
    enum: GitProviderType,
    example: 'GITLAB',
    description: 'Type de provider Git (GITLAB ou GITHUB)',
  })
  @IsEnum(GitProviderType)
  provider!: GitProviderType;

  // ── Champs communs ──────────────────────────────────────────────

  @ApiPropertyOptional({ example: 'group/project', description: 'Chemin du dépôt "owner/repo" (provider-agnostic)' })
  @IsOptional()
  @IsString()
  repoPath?: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  defaultBranch?: string;

  @ApiPropertyOptional({ enum: AppSourceType, default: AppSourceType.REPO })
  @IsOptional()
  @IsEnum(AppSourceType)
  sourceType?: AppSourceType;

  @ApiPropertyOptional({ description: 'Provider ID (Platform Config) pour réutiliser un token existant' })
  @IsOptional()
  @IsString()
  providerId?: string;

  // ── GitLab-specific (optionnel si provider=GITLAB) ──────────────

  @ApiPropertyOptional({ example: 'https://gitlab.com' })
  @IsOptional()
  @IsUrl()
  gitlabUrl?: string;

  @ApiPropertyOptional({ example: 'glpat-xxx' })
  @IsOptional()
  @IsString()
  gitlabToken?: string;

  @ApiPropertyOptional({ type: String, description: 'Repository ID numérique ou chemin' })
  @IsOptional()
  gitlabId?: number | string;

  @ApiPropertyOptional({ type: String, description: 'Group ID numérique ou chemin' })
  @IsOptional()
  gitlabGroupId?: number | string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deployTokenUsername?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deployTokenValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registryUrl?: string;

  // ── GitHub-specific (optionnel si provider=GITHUB) ──────────────

  @ApiPropertyOptional({ description: 'GitHub token (OAuth or PAT)' })
  @IsOptional()
  @IsString()
  githubToken?: string;

  @ApiPropertyOptional({ description: 'Full repo name "owner/repo"' })
  @IsOptional()
  @IsString()
  repoFullName?: string;
}
