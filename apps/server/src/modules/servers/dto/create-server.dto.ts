import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export enum ServerVerificationMode {
  MANUAL = 'manual',
  SSH = 'ssh',
}

export enum ServerConnectionModeDto {
  SSH = 'ssh',
  BASTION = 'bastion',
  AGENT = 'agent',
}

export class CreateServerDto {
  @ApiProperty({ example: 'Local VM Staging' })
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le nom est obligatoire' })
  name!: string;

  @ApiProperty({ example: '192.168.1.100' })
  @IsString({ message: "L'hôte doit être une chaîne de caractères" })
  @IsNotEmpty({ message: "L'hôte est obligatoire" })
  host!: string;

  @ApiPropertyOptional({ example: 22, default: 22 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le port doit être un nombre' })
  port?: number;

  @ApiPropertyOptional({ example: 'ubuntu', default: 'ubuntu' })
  @IsOptional()
  @IsString({ message: 'Le username doit être une chaîne de caractères' })
  username?: string;

  @ApiPropertyOptional({
    example: '-----BEGIN OPENSSH PRIVATE KEY-----...',
    description: 'Requise pour les modes ssh/bastion, optionnelle en mode agent',
  })
  @IsString({ message: 'La clé SSH doit être une chaîne de caractères' })
  @ValidateIf((dto: CreateServerDto) => dto.connectionMode !== ServerConnectionModeDto.AGENT)
  @IsNotEmpty({ message: 'La clé SSH est obligatoire' })
  sshKey?: string;

  @ApiPropertyOptional({
    enum: ServerVerificationMode,
    default: ServerVerificationMode.SSH,
    description:
      'Mode de validation initiale: ssh (auto) ou manual (saisie manuelle via UI)',
  })
  @IsOptional()
  @IsEnum(ServerVerificationMode, {
    message: 'verificationMode doit être "manual" ou "ssh"',
  })
  verificationMode?: ServerVerificationMode;

  @ApiPropertyOptional({
    enum: ServerConnectionModeDto,
    default: ServerConnectionModeDto.SSH,
    description: 'Mode de connexion vers le VPS cible',
  })
  @IsOptional()
  @IsEnum(ServerConnectionModeDto, {
    message: 'connectionMode doit être "ssh", "bastion" ou "agent"',
  })
  connectionMode?: ServerConnectionModeDto;

  @ApiPropertyOptional({ example: '10.0.0.5' })
  @IsOptional()
  @IsString({ message: "Le bastionHost doit être une chaîne de caractères" })
  bastionHost?: string;

  @ApiPropertyOptional({ example: 22 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le bastionPort doit être un nombre' })
  bastionPort?: number;

  @ApiPropertyOptional({ example: 'ubuntu' })
  @IsOptional()
  @IsString({ message: 'Le bastionUsername doit être une chaîne de caractères' })
  bastionUsername?: string;

  @ApiPropertyOptional({ example: '-----BEGIN OPENSSH PRIVATE KEY-----...' })
  @IsOptional()
  @IsString({ message: 'La clé bastionSshKey doit être une chaîne de caractères' })
  bastionSshKey?: string;
}
