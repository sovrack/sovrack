import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateEnvironmentDto {
  @ApiPropertyOptional({ example: 'production' })
  @IsOptional()
  @IsString({ message: "Le nom de l'environnement doit être une chaîne" })
  @MaxLength(50, { message: "Le nom de l'environnement est trop long (50 max)" })
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, {
    message:
      "Le nom de l'environnement ne peut contenir que lettres, chiffres, '.', '_' et '-'",
  })
  name?: string;

  @ApiPropertyOptional({ example: '{"NODE_ENV":"production"}' })
  @IsOptional()
  @IsString({ message: 'env doit être une chaîne JSON' })
  env?: string;
}
