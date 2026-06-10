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
  @MaxLength(50, { message: "Le nom de l'environnement est trop long (50 max)" })
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, {
    message:
      "Le nom de l'environnement ne peut contenir que lettres, chiffres, '.', '_' et '-'",
  })
  name!: string;

  @ApiProperty({ example: 'server-uuid' })
  @IsString({ message: 'serverId doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'serverId est obligatoire' })
  serverId!: string;

  @ApiPropertyOptional({ example: 'staging.example.com' })
  @IsOptional()
  @IsString({ message: 'Le domaine doit être une chaîne de caractères' })
  domain?: string;
}
