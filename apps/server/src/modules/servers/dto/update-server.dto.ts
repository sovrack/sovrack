import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ServerConnectionModeDto } from './create-server.dto';

export class UpdateServerDto {
  @ApiPropertyOptional({ example: 'Production VPS' })
  @IsOptional()
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  name?: string;

  @ApiPropertyOptional({ example: '10.0.0.10' })
  @IsOptional()
  @IsString({ message: "L'hôte doit être une chaîne de caractères" })
  host?: string;

  @ApiPropertyOptional({ example: 22 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le port doit être un nombre' })
  port?: number;

  @ApiPropertyOptional({ example: 'ubuntu' })
  @IsOptional()
  @IsString({ message: 'Le username doit être une chaîne de caractères' })
  username?: string;

  @ApiPropertyOptional({ example: '-----BEGIN OPENSSH PRIVATE KEY-----...' })
  @IsOptional()
  @IsString({ message: 'La clé SSH doit être une chaîne de caractères' })
  sshKey?: string;

  @ApiPropertyOptional({
    enum: ServerConnectionModeDto,
    description: 'Mode de connexion vers le VPS cible',
  })
  @IsOptional()
  @IsEnum(ServerConnectionModeDto, {
    message: 'connectionMode doit être "ssh", "bastion" ou "agent"',
  })
  connectionMode?: ServerConnectionModeDto;

  @ApiPropertyOptional({ example: '10.0.0.5' })
  @IsOptional()
  @IsString({ message: 'Le bastionHost doit être une chaîne de caractères' })
  bastionHost?: string;

  @ApiPropertyOptional({ example: 22 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le bastionPort doit être un nombre' })
  bastionPort?: number;

  @ApiPropertyOptional({ example: 'ubuntu' })
  @IsOptional()
  @IsString({
    message: 'Le bastionUsername doit être une chaîne de caractères',
  })
  bastionUsername?: string;

  @ApiPropertyOptional({ example: '-----BEGIN OPENSSH PRIVATE KEY-----...' })
  @IsOptional()
  @IsString({
    message: 'La clé bastionSshKey doit être une chaîne de caractères',
  })
  bastionSshKey?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'isActive doit être un booléen' })
  isActive?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'isVerified doit être un booléen' })
  isVerified?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'hasDocker doit être un booléen' })
  hasDocker?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'hasAnsible doit être un booléen' })
  hasAnsible?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'hasRunner doit être un booléen' })
  hasRunner?: boolean;
}
