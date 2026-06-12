import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum ServerVerificationMode {
  MANUAL = 'manual',
  SSH = 'ssh',
}

export enum ServerConnectionModeDto {
  SSH = 'ssh',
}

export class CreateServerDto {
  @ApiProperty({ example: 'Production VPS' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom est obligatoire' })
  @MaxLength(80, { message: 'Le nom ne peut pas dépasser 80 caractères' })
  name!: string;

  @ApiProperty({ example: '192.168.1.100' })
  @IsString()
  @IsNotEmpty({ message: "L'hôte est obligatoire" })
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,253}$/, {
    message:
      "L'hôte doit être une adresse IP ou un nom de domaine valide (ex: 192.168.1.1 ou mon-serveur.exemple.com)",
  })
  host!: string;

  @ApiPropertyOptional({ example: 22, default: 22 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le port doit être un nombre' })
  @Min(1, { message: 'Le port doit être supérieur à 0' })
  @Max(65535, { message: 'Le port doit être inférieur ou égal à 65535' })
  port?: number;

  @ApiPropertyOptional({ example: 'ubuntu', default: 'ubuntu' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Le username ne peut pas être vide' })
  @MaxLength(32, { message: 'Le username ne peut pas dépasser 32 caractères' })
  @Matches(/^[a-z_][a-z0-9_-]{0,31}$/i, {
    message:
      'Le username SSH doit commencer par une lettre ou underscore, et ne contenir que des lettres, chiffres, tirets et underscores',
  })
  username?: string;

  @ApiPropertyOptional({
    example: '-----BEGIN OPENSSH PRIVATE KEY-----\n...',
    description:
      'Clé privée SSH (OpenSSH ou PKCS8). Si absente, la plateforme génère automatiquement une paire de clés.',
  })
  @IsOptional()
  @IsString()
  @Matches(/PRIVATE KEY/, {
    message:
      'La clé SSH doit être au format PEM (contenir "PRIVATE KEY"). Formats acceptés : OpenSSH, PKCS8.',
  })
  sshKey?: string;

  @ApiPropertyOptional({
    enum: ServerVerificationMode,
    default: ServerVerificationMode.MANUAL,
    description:
      'Déprécié: ce champ est ignoré. Le serveur est créé puis la clé SSH doit être installée via /servers/:id/install-key.',
    deprecated: true,
  })
  @IsOptional()
  @IsEnum(ServerVerificationMode, {
    message: 'verificationMode doit être "manual" ou "ssh"',
  })
  verificationMode?: ServerVerificationMode;

  @ApiPropertyOptional({
    description: 'ID of an existing SshKey to use for this server connection.',
  })
  @IsOptional()
  @IsString()
  sshKeyId?: string;

  @ApiPropertyOptional({
    enum: ServerConnectionModeDto,
    default: ServerConnectionModeDto.SSH,
    description: 'Mode de connexion : ssh (direct SSH)',
  })
  @IsOptional()
  @IsEnum(ServerConnectionModeDto, {
    message: 'connectionMode doit être "ssh"',
  })
  connectionMode?: ServerConnectionModeDto;
}
