import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  nginx?: boolean;

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
}
