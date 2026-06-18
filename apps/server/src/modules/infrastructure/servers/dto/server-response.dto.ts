import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ServerPreparationProfile,
  ServerPreparationStatus,
  ServerPreparationTaskStatus,
  ServerInstalledToolStatus,
  ServerJobStatus,
  ServerJobType,
  ServerStatus,
  ServerLogLevel,
} from '@prisma/client';
import { ServerConnectionModeDto } from './create-server.dto';

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

export class ServerPreparationTaskDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  preparationId!: string;

  @ApiProperty()
  roleKey!: string;

  @ApiProperty()
  taskName!: string;

  @ApiProperty()
  orderIndex!: number;

  @ApiProperty({ enum: ServerPreparationTaskStatus })
  status!: ServerPreparationTaskStatus;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  startedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  finishedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  message!: string | null;
}

export class ServerPreparationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  serverId!: string;

  @ApiProperty({ enum: ServerPreparationStatus })
  status!: ServerPreparationStatus;

  @ApiProperty({ enum: ServerPreparationProfile })
  profile!: ServerPreparationProfile;

  @ApiProperty()
  triggerSource!: string;

  @ApiPropertyOptional({ nullable: true })
  requestedById!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  startedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  finishedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  summary!: string | null;

  @ApiPropertyOptional({ nullable: true })
  errorMessage!: string | null;

  @ApiPropertyOptional({ nullable: true })
  retryOfPreparationId!: string | null;

  @ApiProperty({ type: () => ServerPreparationTaskDto, isArray: true })
  tasks!: ServerPreparationTaskDto[];
}

export class ServerPreparationLogDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  preparationId!: string;

  @ApiProperty({ enum: ServerLogLevel })
  level!: ServerLogLevel;

  @ApiProperty()
  source!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  lineNumber!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class ServerPreparationReadinessChecksDto {
  @ApiProperty()
  serverActive!: boolean;

  @ApiProperty()
  serverNotDisabled!: boolean;

  @ApiProperty()
  sshValidated!: boolean;

  @ApiProperty()
  sshReachable!: boolean;

  @ApiProperty()
  authSucceeded!: boolean;

  @ApiProperty()
  sudoAvailable!: boolean;

  @ApiProperty()
  noActivePreparation!: boolean;
}

export class ServerPreparationReadinessDto {
  @ApiProperty()
  serverId!: string;

  @ApiProperty()
  isReady!: boolean;

  @ApiProperty({ type: () => ServerPreparationReadinessChecksDto })
  checks!: ServerPreparationReadinessChecksDto;

  @ApiProperty({ type: [String] })
  blockingReasons!: string[];

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  latestValidationAt!: string | null;
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
