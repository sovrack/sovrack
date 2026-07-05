import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsJSON,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
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
  // ValidateIf (plutôt que IsOptional) car '' est une valeur légitime ici
  // (environments.service.ts l'écrit tel quel — "aucun secret" — write path
  // dto.secretsEnv !== undefined) ; IsJSON seul rejetterait '' comme JSON
  // invalide, ce qui casserait ce cas déjà supporté aujourd'hui.
  @ValidateIf(
    (o: CreateEnvironmentDto) =>
      o.secretsEnv !== undefined &&
      o.secretsEnv !== null &&
      o.secretsEnv !== '',
  )
  @IsJSON({ message: 'secretsEnv doit être un JSON valide' })
  secretsEnv?: string;
}
