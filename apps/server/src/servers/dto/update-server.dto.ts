import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

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

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'isActive doit être un booléen' })
  isActive?: boolean;
}
