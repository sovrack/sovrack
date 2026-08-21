import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BuildMode,
  BuildPack,
  DeployTrigger,
  GitProviderType,
  ManagedServiceType,
  Prisma,
  ServiceType,
  SourceType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsJSON,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class SourceConnectionDto {
  @ApiProperty({ enum: GitProviderType })
  @IsEnum(GitProviderType)
  provider!: GitProviderType;

  @ApiProperty({ example: 'group/project' })
  @IsString()
  @IsNotEmpty()
  repoPath!: string;

  @ApiProperty({ example: '<git-access-token>' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  branch?: string;
}

export class CreateServiceDto {
  @ApiProperty({ example: 'api' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du service est requis' })
  name!: string;

  @ApiPropertyOptional({ enum: ServiceType, example: ServiceType.APPLICATION })
  @IsOptional()
  @IsEnum(ServiceType)
  type?: ServiceType;

  @ApiPropertyOptional({ example: 'Backend API NestJS' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: SourceType, example: SourceType.GIT })
  @IsOptional()
  @IsEnum(SourceType)
  sourceType?: SourceType;

  @ApiPropertyOptional({ example: 'org/repo' })
  @IsOptional()
  @IsString()
  repoPath?: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional({ example: 'git-provider-uuid' })
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({ example: '/' })
  @IsOptional()
  @IsString()
  // Server-side enforcement of the monorepo subfolder constraint — the
  // frontend already rejects ".." client-side, but that's not a security
  // boundary: a direct API call could otherwise send rootDir="../../etc" and
  // local-build.service.ts would happily build outside the cloned repo.
  @Matches(/^(?!.*\.\.).*$/, {
    message: 'rootDir must not contain ".." (no path traversal).',
  })
  rootDir?: string;

  @ApiPropertyOptional({ enum: BuildPack, example: BuildPack.DOCKERFILE })
  @IsOptional()
  @IsEnum(BuildPack)
  buildPack?: BuildPack;

  @ApiPropertyOptional({ enum: BuildMode, example: BuildMode.LOCAL })
  @IsOptional()
  @IsEnum(BuildMode)
  buildMode?: BuildMode;

  @ApiPropertyOptional({ enum: DeployTrigger, example: DeployTrigger.PUSH })
  @IsOptional()
  @IsEnum(DeployTrigger)
  deployTrigger?: DeployTrigger;

  @ApiPropertyOptional({
    example: 'registry.gitlab.com/grp/app:latest',
    description: 'Mode REGISTRY : image à tirer telle quelle (sinon dérivée).',
  })
  @IsOptional()
  @IsString()
  registryImage?: string;

  @ApiPropertyOptional({ example: 'railpack' })
  @IsOptional()
  @IsString()
  buildType?: string;

  @ApiPropertyOptional({ example: 'FROM node:20\nWORKDIR /app\n...' })
  @IsOptional()
  @IsString()
  dockerfile?: string;

  @ApiPropertyOptional({ example: 3000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({ example: 'npm run start:prod' })
  @IsOptional()
  @IsString()
  startCommand?: string;

  @ApiPropertyOptional({ example: 0.5, description: 'CPU limit in cores' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cpuLimit?: number;

  @ApiPropertyOptional({ example: 512, description: 'Memory limit in MB' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  memLimitMb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  buildArgs?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  nixpacksConfig?: Prisma.InputJsonValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  staticConfig?: Prisma.InputJsonValue;

  @ApiPropertyOptional({ example: 'version: "3.8"\nservices:\n  api:\n...' })
  @IsOptional()
  @IsString()
  dockerComposeContent?: string;

  @ApiPropertyOptional({ example: 'api' })
  @IsOptional()
  @IsString()
  composeServiceName?: string;

  @ApiPropertyOptional({
    enum: ManagedServiceType,
    example: ManagedServiceType.POSTGRES,
  })
  @IsOptional()
  @IsEnum(ManagedServiceType)
  databaseType?: ManagedServiceType;

  @ApiPropertyOptional({ example: '16' })
  @IsOptional()
  @IsString()
  databaseVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  databaseCredentials?: Record<string, string>;

  @ApiPropertyOptional({
    example: 5432,
    description:
      'DATABASE services only. Host port to publish for external access. ' +
      'Null/omitted = not exposed externally (default) — only reachable ' +
      'from other services in the project via the internal Docker network.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  externalPort?: number;

  @ApiPropertyOptional({ example: '{"NODE_ENV":"production"}' })
  @IsOptional()
  @IsString()
  env?: string;

  @ApiPropertyOptional({
    description:
      'Service-level default secrets as a JSON string (encrypted at rest, ' +
      'AES-256-GCM). Base layer of the secret hierarchy, overridden by ' +
      'Environment and ServiceEnvironment secrets at deploy time. Never ' +
      'returned in clear — responses expose only secretsEnvKeys.',
    example: '{"API_KEY":"s3cr3t"}',
  })
  // ValidateIf (plutôt que IsOptional) car '' est une valeur légitime ici
  // (services.service.ts l'écrit tel quel — "aucun secret" — voir le write
  // path dto.secretsEnv !== undefined) ; IsJSON seul rejetterait '' comme
  // JSON invalide, ce qui casserait ce cas déjà supporté aujourd'hui.
  @ValidateIf(
    (o: CreateServiceDto) =>
      o.secretsEnv !== undefined &&
      o.secretsEnv !== null &&
      o.secretsEnv !== '',
  )
  @IsJSON({ message: 'secretsEnv doit être un JSON valide' })
  secretsEnv?: string;

  @ApiPropertyOptional({ example: '/health' })
  @IsOptional()
  @IsString()
  healthcheckPath?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  replicas?: number;

  @ApiPropertyOptional({
    description: 'Source connection (GitLab/GitHub) on creation',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SourceConnectionDto)
  source?: SourceConnectionDto;
}
