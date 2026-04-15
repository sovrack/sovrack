import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateDeploymentDto {
  @ApiProperty({ example: 'project-uuid' })
  @IsString({ message: 'projectId doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'projectId est obligatoire' })
  projectId!: string;

  @ApiProperty({ example: 'environment-uuid' })
  @IsString({ message: 'environmentId doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'environmentId est obligatoire' })
  environmentId!: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString({ message: 'La branche doit être une chaîne de caractères' })
  branch?: string;

  @ApiPropertyOptional({
    example: 42,
    description:
      'Repository GitLab ciblé (recommandé pour source GROUP, optionnel pour REPO)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'repoId doit être un entier positif' })
  @Min(1, { message: 'repoId doit être supérieur à 0' })
  repoId?: number;
}
