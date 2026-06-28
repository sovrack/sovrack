import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

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

  @ApiPropertyOptional({
    example: 3,
    description:
      'Max simultaneous in-flight deployments for this project (0 = unlimited).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxConcurrentDeploys?: number;
}
