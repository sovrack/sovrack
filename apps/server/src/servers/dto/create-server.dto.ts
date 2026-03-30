import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

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

  @ApiProperty({ example: '-----BEGIN OPENSSH PRIVATE KEY-----...' })
  @IsString({ message: 'La clé SSH doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'La clé SSH est obligatoire' })
  sshKey!: string;
}
