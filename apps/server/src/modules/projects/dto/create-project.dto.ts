import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppSourceType } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
} from 'class-validator';

/**
 * DTO de création de projet.
 */
export class CreateProjectDto {
  @ApiProperty({ example: 'App E-commerce' })
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le nom est requis' })
  name: string;

  @ApiPropertyOptional({ example: 'Application e-commerce interne' })
  @IsOptional()
  @IsString({ message: 'La description doit être une chaîne de caractères' })
  description?: string;

  @ApiPropertyOptional({ example: 'https://gitlab.com/test/ecommerce' })
  @IsOptional()
  @IsUrl({}, { message: 'URL GitLab invalide' })
  gitlabUrl?: string;

  @ApiPropertyOptional({
    example: 'b5073d11-f378-4c71-87da-093f3ecf20af',
    description:
      'Provider GitLab global. Si fourni, gitlabToken peut être omis.',
  })
  @IsOptional()
  @IsString({ message: 'providerId doit être une chaîne de caractères' })
  providerId?: string;

  @ApiPropertyOptional({ example: 'glpat-xxxxxxxxxxxxxxxxxxxx' })
  @IsOptional()
  @IsString({ message: 'Le token GitLab doit être une chaîne de caractères' })
  gitlabToken?: string;

  @ApiPropertyOptional({
    example: 'group/project',
    type: String,
    description: 'Repository path "group/project" (recommended, provider-agnostic) or numeric ID.',
  })
  @IsOptional()
  gitlabId?: number | string;

  @ApiPropertyOptional({
    example: 'platform/apps',
    description: 'Group ID numerique ou chemin GitLab',
    type: String,
  })
  @IsOptional()
  gitlabGroupId?: number | string;

  @ApiPropertyOptional({
    enum: AppSourceType,
    default: AppSourceType.REPO,
  })
  @IsOptional()
  @IsEnum(AppSourceType)
  sourceType?: AppSourceType;

  @ApiPropertyOptional({ example: 'gitlab+deploy-token-12' })
  @IsOptional()
  @IsString({
    message: 'deployTokenUsername doit être une chaîne de caractères',
  })
  deployTokenUsername?: string;

  @ApiPropertyOptional({ example: 'glrt-xxxxxxxxxxxxxxxxxxxx' })
  @IsOptional()
  @IsString({ message: 'deployTokenValue doit être une chaîne de caractères' })
  deployTokenValue?: string;

  @ApiPropertyOptional({ example: 'registry.gitlab.example.com' })
  @IsOptional()
  @IsString({ message: 'registryUrl doit être une chaîne de caractères' })
  registryUrl?: string;

  @ApiPropertyOptional({ example: 'main', default: 'main' })
  @IsOptional()
  @IsString({ message: 'La branche doit être une chaîne de caractères' })
  branch?: string;

  @ApiPropertyOptional({
    example: '0fca8a5f-4f31-43fc-a5a8-d4f07102e8dd',
    description: 'Utilisateur DEVELOPER à assigner comme OWNER',
  })
  @IsOptional()
  @IsUUID('4', { message: 'ownerId doit être un UUID valide' })
  ownerId?: string;
}
