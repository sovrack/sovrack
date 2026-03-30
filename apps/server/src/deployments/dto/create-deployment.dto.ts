import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}
