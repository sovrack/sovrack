import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
