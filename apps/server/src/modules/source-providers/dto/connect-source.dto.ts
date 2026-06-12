import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GitProviderType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * Provider-agnostic DTO for connecting a source (GitLab or GitHub) to a
 * project. Used by the unified endpoint `POST /projects/:id/source/connect`.
 *
 * Lives under `source-providers/dto/` (not under `gitlab/`) because it is
 * not GitLab-specific — `provider` selects the target backend.
 */
export class ConnectSourceDto {
  @ApiProperty({
    enum: GitProviderType,
    example: 'GITLAB',
    description: 'Type de provider Git (GITLAB ou GITHUB)',
  })
  @IsEnum(GitProviderType)
  provider!: GitProviderType;

  @ApiPropertyOptional({ example: 'group/project', description: 'Chemin du dépôt "owner/repo" (provider-agnostic)' })
  @IsOptional()
  @IsString()
  repoPath?: string;

  @ApiPropertyOptional({ example: 'my-group', description: 'Path du groupe/org pour découvrir tous les repos' })
  @IsOptional()
  @IsString()
  groupPath?: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  defaultBranch?: string;

  @ApiPropertyOptional({ description: 'Provider ID (Platform Config) pour réutiliser un token existant' })
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({ description: "Token d'accès (PAT ou token provider)" })
  @IsOptional()
  @IsString()
  token?: string;
}
