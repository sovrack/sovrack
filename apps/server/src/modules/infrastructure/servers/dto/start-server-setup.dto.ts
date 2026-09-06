import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ServerSetupProfile {
  RUNTIME_MINIMAL = 'runtime-minimal',
  OBSERVABILITY_AGENT = 'observability-agent',
  BUILD_RUNNER = 'build-runner',
  FULL_DEV = 'full-dev',
}

/**
 * The server profile is explicit. Production defaults to the smallest runtime
 * needed by Sovrack; build and dashboard tooling are opt-in.
 */
export class StartServerSetupDto {
  @ApiPropertyOptional({
    enum: ServerSetupProfile,
    default: ServerSetupProfile.RUNTIME_MINIMAL,
  })
  @IsOptional()
  @IsEnum(ServerSetupProfile)
  profile?: ServerSetupProfile;

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
