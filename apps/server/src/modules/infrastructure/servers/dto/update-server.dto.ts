import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ServerConnectionModeDto } from './create-server.dto';

export class UpdateServerDto {
  @ApiPropertyOptional({ example: 'Production VPS' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: '10.0.0.10' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,253}$/, {
    message: "L'hôte doit être une adresse IP ou un nom de domaine valide",
  })
  host?: string;

  @ApiPropertyOptional({ example: 22 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Le port doit être un nombre' })
  @Min(1, { message: 'Le port doit être supérieur à 0' })
  @Max(65535, { message: 'Le port doit être inférieur ou égal à 65535' })
  port?: number;

  @ApiPropertyOptional({ example: 'ubuntu' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z_][a-z0-9_-]{0,31}$/i, {
    message: 'Le username SSH doit être un username Linux valide',
  })
  username?: string;

  @ApiPropertyOptional({ example: '-----BEGIN OPENSSH PRIVATE KEY-----\n...' })
  @IsOptional()
  @IsString()
  @Matches(/PRIVATE KEY/, {
    message: 'La clé SSH doit être au format PEM (contenir "PRIVATE KEY")',
  })
  sshKey?: string;

  @ApiPropertyOptional({
    description:
      'ID of an existing SshKey (Settings → SSH Keys) to switch this server to. Ignored if `sshKey` is also provided.',
  })
  @IsOptional()
  @IsString()
  sshKeyId?: string;

  @ApiPropertyOptional({ enum: ServerConnectionModeDto })
  @IsOptional()
  @IsEnum(ServerConnectionModeDto, {
    message: 'connectionMode doit être "ssh"',
  })
  connectionMode?: ServerConnectionModeDto;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  // hasDocker/hasRunner removed: they are derived from Server.capabilities
  // (written by detection), not user-settable.
}
