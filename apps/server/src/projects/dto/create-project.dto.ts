import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

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

  @ApiProperty({ example: 'https://gitlab.com/test/ecommerce' })
  @IsUrl({}, { message: 'URL GitLab invalide' })
  @IsNotEmpty({ message: 'URL GitLab requise' })
  gitlabUrl: string;

  @ApiPropertyOptional({ example: 'main', default: 'main' })
  @IsOptional()
  @IsString({ message: 'La branche doit être une chaîne de caractères' })
  branch?: string;
}
