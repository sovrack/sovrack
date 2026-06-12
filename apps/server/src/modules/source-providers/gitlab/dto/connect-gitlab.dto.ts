import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ConnectGitlabDto {
  @ApiPropertyOptional({ example: 'glpat-xxxxxxxxxxxxxxxxxxxx' })
  @IsOptional()
  @IsString()
  gitlabToken?: string;

  @ApiPropertyOptional({ example: 'https://gitlab.com' })
  @IsOptional()
  @IsString()
  gitlabUrl?: string;

  @ApiPropertyOptional({
    example: 'b5073d11-f378-4c71-87da-093f3ecf20af',
    description: 'Provider config ID. Si fourni, URL/token peuvent être omis.',
  })
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({
    example: 'group/project',
    description: 'Repository path "group/project" (provider-agnostic).',
  })
  @IsOptional()
  @IsString()
  repoPath?: string;

  @ApiPropertyOptional({
    example: 'my-group',
    description: 'Group/org path pour découvrir tous les repos du groupe.',
  })
  @IsOptional()
  @IsString()
  groupPath?: string;

  @ApiPropertyOptional({ example: 'main', default: 'main' })
  @IsOptional()
  @IsString()
  defaultBranch?: string;
}
