import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ServerInstalledToolStatus,
  ServerJobStatus,
  ServerJobType,
  ServerStatus,
  ServerLogLevel,
} from '@prisma/client';
import { ServerConnectionModeDto } from './create-server.dto';

// Les DTOs de préparation vivent désormais dans un fichier dédié ; re-exportés
// ici pour que les importeurs existants (controllers) restent inchangés.
export {
  ServerPreparationTaskDto,
  ServerPreparationDto,
  ServerPreparationLogDto,
  ServerPreparationReadinessChecksDto,
  ServerPreparationReadinessDto,
} from './server-preparation-response.dto';

export class ServerActiveJobDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ServerJobType })
  type!: ServerJobType;

  @ApiProperty({ enum: ServerJobStatus })
  status!: ServerJobStatus;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  startedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  error!: string | null;
}

export class ServerResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  host!: string;

  @ApiProperty()
  port!: number;

  @ApiProperty()
  username!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  sshPublicKey!: string | null;

  @ApiProperty({ enum: ServerConnectionModeDto })
  connectionMode!: ServerConnectionModeDto;

  @ApiPropertyOptional({ type: String, nullable: true })
  bastionHost!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  bastionPort!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  bastionUsername!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'date-time',
  })
  agentLastSeenAt!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isVerified!: boolean;

  @ApiProperty()
  onboardingStep!: string;

  @ApiProperty({ enum: ServerStatus })
  status!: ServerStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  verificationError!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  lastVerifiedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  lastDetectedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  lastPreparedAt!: string | null;

  @ApiProperty()
  hasDocker!: boolean;

  @ApiProperty()
  hasRunner!: boolean;

  // A4: was already present in the real response (toPublicServer spreads
  // every Server column except sshKey) but never declared here — the list
  // page needs this to show real per-server tool badges (Docker/Postgres/
  // Redis/etc.) instead of just the 2 hasDocker/hasRunner booleans.
  @ApiPropertyOptional({
    type: () => ServerInstalledToolDto,
    isArray: true,
    description:
      'Tools detected on this server (Docker, Postgres, Redis, Nginx, etc.) — written by capability detection. No Traefik entry: it is not tracked as a per-server OS capability on this platform (it runs as a deployment-time reverse proxy, not an installed package).',
  })
  installedTools?: ServerInstalledToolDto[];

  @ApiPropertyOptional({
    type: String,
    description:
      'Infrastructure role: NONE | STAGING | PRODUCTION | DATABASE | RUNNER | MONITORING',
  })
  infraRole?: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({
    type: () => ServerActiveJobDto,
    nullable: true,
    description:
      'Job actuellement actif (RUNNING/PENDING) verrouillant ce serveur, sinon null.',
  })
  activeJob?: ServerActiveJobDto | null;
}

export class CreateServerResponseDto extends ServerResponseDto {
  @ApiPropertyOptional()
  agentBootstrapToken?: string;
}

export class ServerJobResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  serverId!: string;

  @ApiProperty({ enum: ServerJobType })
  type!: ServerJobType;

  @ApiProperty({ enum: ServerJobStatus })
  status!: ServerJobStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  output!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  error!: string | null;

  @ApiProperty()
  attempts!: number;

  @ApiProperty()
  maxAttempts!: number;

  @ApiProperty()
  timeoutMs!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'date-time',
  })
  startedAt!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'date-time',
  })
  finishedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'For PREPARE_SERVER jobs: the id of the ServerRun (kind=PREPARATION) it triggered — fetch it for the step-by-step Ansible log. Null for job types that never ran Ansible (VERIFY/INSTALL_TOOLS/REGISTER_RUNNER).',
  })
  preparationId!: string | null;
}

export class PaginatedServerJobsResponseDto {
  @ApiProperty({ type: () => ServerJobResponseDto, isArray: true })
  data!: ServerJobResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;
}

export class PaginatedServersResponseDto {
  @ApiProperty({ type: () => ServerResponseDto, isArray: true })
  data!: ServerResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;
}

export class DeleteServerResponseDto {
  @ApiProperty({ example: 'Server deleted successfully' })
  message!: string;
}

export class InstallKeyResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'SSH public key installed successfully' })
  message!: string;
}

export class ServerLogDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  serverId!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ enum: ServerLogLevel })
  level!: ServerLogLevel;

  @ApiPropertyOptional()
  context?: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class ServerVerificationStatusDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ServerStatus })
  status!: ServerStatus;

  @ApiPropertyOptional()
  verificationError?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  lastVerifiedAt?: string;

  @ApiProperty()
  isVerified!: boolean;

  @ApiProperty()
  hasDocker!: boolean;

  @ApiProperty()
  hasRunner!: boolean;

  @ApiProperty({ type: () => ServerLogDto, isArray: true })
  recentLogs!: ServerLogDto[];
}

export class VerifyServerResponseDto {
  @ApiProperty()
  serverId!: string;

  @ApiProperty({
    example: 'Verification started, check status endpoint for updates',
  })
  message!: string;

  @ApiProperty({ enum: ServerStatus })
  status!: ServerStatus;
}

export class ServerValidationResultDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  serverId!: string;

  @ApiProperty()
  sshReachable!: boolean;

  @ApiProperty()
  authSucceeded!: boolean;

  @ApiProperty()
  sudoAvailable!: boolean;

  @ApiPropertyOptional({ nullable: true })
  fingerprint!: string | null;

  @ApiPropertyOptional({ nullable: true })
  osName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  osVersion!: string | null;

  @ApiPropertyOptional({ nullable: true })
  architecture!: string | null;

  @ApiProperty()
  pythonAvailable!: boolean;

  @ApiPropertyOptional({ nullable: true })
  validationMessage!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  validatedAt!: string | null;
}

export class ServerCapabilityDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  serverId!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  value!: string;

  @ApiProperty()
  source!: string;

  @ApiProperty({ format: 'date-time' })
  detectedAt!: string;
}

export class ServerInstalledToolDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  serverId!: string;

  @ApiProperty()
  toolKey!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional({ nullable: true })
  version!: string | null;

  @ApiPropertyOptional({ nullable: true })
  installedBy!: string | null;

  @ApiProperty({ enum: ServerInstalledToolStatus })
  status!: ServerInstalledToolStatus;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  installedAt!: string | null;
}

export class ServerAuditEventDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  serverId!: string;

  @ApiPropertyOptional({ nullable: true })
  actorId!: string | null;

  @ApiProperty()
  eventType!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'JSON payload describing the audited action context.',
  })
  payloadJson!: Record<string, unknown> | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
