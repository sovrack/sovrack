import { EnvName } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateEnvironmentDto {
  @ApiProperty({ enum: EnvName, example: EnvName.STAGING })
  @IsEnum(EnvName, { message: "Le nom de l'environnement est invalide" })
  name!: EnvName;

  @ApiProperty({ example: 'server-uuid' })
  @IsString({ message: 'serverId doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'serverId est obligatoire' })
  serverId!: string;

  @ApiPropertyOptional({ example: 'staging.example.com' })
  @IsOptional()
  @IsString({ message: 'Le domaine doit être une chaîne de caractères' })
  domain?: string;
}
