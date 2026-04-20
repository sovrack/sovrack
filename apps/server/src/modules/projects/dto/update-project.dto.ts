import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * DTO de mise à jour de projet.
 */
export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'App E-commerce V2' })
  @IsOptional()
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  name?: string;

  @ApiPropertyOptional({ example: 'Description mise à jour' })
  @IsOptional()
  @IsString({ message: 'La description doit être une chaîne de caractères' })
  description?: string;

  @ApiPropertyOptional({ example: 'https://gitlab.com/test/ecommerce' })
  @IsOptional()
  @IsUrl({}, { message: 'URL GitLab invalide' })
  gitlabUrl?: string;

  @ApiPropertyOptional({ example: 'develop' })
  @IsOptional()
  @IsString({ message: 'La branche doit être une chaîne de caractères' })
  branch?: string;
}
