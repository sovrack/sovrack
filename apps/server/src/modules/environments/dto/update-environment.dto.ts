import { EnvName } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateEnvironmentDto {
  @ApiPropertyOptional({ enum: EnvName, example: EnvName.PRODUCTION })
  @IsOptional()
  @IsEnum(EnvName, { message: "Le nom de l'environnement est invalide" })
  name?: EnvName;

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
}
