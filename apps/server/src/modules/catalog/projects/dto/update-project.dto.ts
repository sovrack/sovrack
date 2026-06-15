import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * DTO de mise à jour de projet.
 */
export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'App E-commerce V2' })
  @IsOptional()
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString({ message: 'La description doit être une chaîne de caractères' })
  description?: string;


}
