import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ServerPreparationProfile } from '@prisma/client';

export class StartServerPreparationDto {
  @ApiPropertyOptional({
    enum: ServerPreparationProfile,
    default: ServerPreparationProfile.BASIC,
    description:
      'Reusable preparation profile. Explicit options override profile defaults.',
  })
  @IsOptional()
  @IsEnum(ServerPreparationProfile)
  profile?: ServerPreparationProfile;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  systemUpdate?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  docker?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  dockerComposePlugin?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Configure Docker daemon mTLS (port 2376) and auto-register the ' +
      'DockerConnection — required for the platform to deploy on this server.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  dockerTls?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Install Traefik reverse proxy (ports 80/443) with automatic Let’s ' +
      'Encrypt HTTPS. Services with a domain then get certificates at deploy.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  reverseProxy?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  nginx?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  nixpacks?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  nodejs?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  postgres?: boolean;

  @ApiPropertyOptional({ example: false, deprecated: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  postgresql?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  redis?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  gitlabRunner?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  firewall?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  fail2ban?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  certbot?: boolean;

  @ApiPropertyOptional({ example: false, deprecated: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ssl?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  swap?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  monitoring?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  backup?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  logrotate?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  securityHardening?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  autoUpdates?: boolean;

  @ApiPropertyOptional({
    example: 'docker',
    description:
      'Executor mode for GitLab Runner. docker implies Docker dependency.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  gitlabRunnerExecutor?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['docker', 'nginx'],
    description:
      'Option keys that should be forced-reinstalled even if the tool is already detected as installed. By default, roles for already-installed tools still run (idempotent), but this flag signals explicit user intent to reinstall/reconfigure.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reinstallOptions?: string[];
}
