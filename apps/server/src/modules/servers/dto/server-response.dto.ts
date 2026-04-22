import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ServerJobStatus,
  ServerJobType,
  ServerStatus,
  ServerLogLevel,
} from '@prisma/client';
import { ServerConnectionModeDto } from './create-server.dto';

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

  @ApiProperty()
  hasDocker!: boolean;

  @ApiProperty()
  hasAnsible!: boolean;

  @ApiProperty()
  hasRunner!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
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
  @ApiProperty({ example: 'Serveur supprimé avec succès' })
  message!: string;
}

export class InstallKeyResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Clé publique SSH installée avec succès' })
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
  hasAnsible!: boolean;

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
