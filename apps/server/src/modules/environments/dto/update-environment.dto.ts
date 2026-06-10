import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
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

  @ApiPropertyOptional({ example: 'server-uuid' })
  @IsOptional()
  @IsString({ message: 'serverId doit être une chaîne de caractères' })
  serverId?: string;

  @ApiPropertyOptional({ example: 'app.example.com' })
  @IsOptional()
  @IsString({ message: 'Le domaine doit être une chaîne de caractères' })
  domain?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'isActive doit être un booléen' })
  isActive?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'autoDeploy doit être un booléen' })
  autoDeploy?: boolean;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString({ message: 'autoDeployBranch doit être une chaîne de caractères' })
  autoDeployBranch?: string;
}
