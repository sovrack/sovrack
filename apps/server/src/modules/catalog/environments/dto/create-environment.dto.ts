import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateEnvironmentDto {
  @ApiProperty({ example: 'staging' })
  @IsString({ message: "Le nom de l'environnement doit être une chaîne" })
  @IsNotEmpty({ message: "Le nom de l'environnement est obligatoire" })
  @MaxLength(50, {
    message: "Le nom de l'environnement est trop long (50 max)",
  })
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, {
    message:
      "Le nom de l'environnement ne peut contenir que lettres, chiffres, '.', '_' et '-'",
  })
  name!: string;

  @ApiPropertyOptional({ example: '{"NODE_ENV":"staging","PORT":3001}' })
  @IsOptional()
  @IsString({ message: 'env doit être une chaîne JSON' })
  env?: string;

  @ApiPropertyOptional({
    description: 'Secrets JSON (chiffrés au repos)',
    example: '{"DB_PASSWORD":"..."}',
  })
  @IsOptional()
  @IsString({ message: 'secretsEnv doit être une chaîne JSON' })
  secretsEnv?: string;
}
