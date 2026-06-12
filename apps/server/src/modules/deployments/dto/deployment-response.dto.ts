import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeploymentStatus } from '@prisma/client';

export class DeploymentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: DeploymentStatus })
  status!: DeploymentStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  logs!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  dockerImage!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Immutable image digest (sha256:…) — the rollback target.' })
  imageSha?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Immutable Release: frozen desired state captured at deploy time (source, build).' })
  specSnapshot?: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true, description: 'Concrete refs this deployment resolved to (server, environment).' })
  resolvedRefs?: Record<string, unknown> | null;

  @ApiPropertyOptional({ isArray: true, description: 'Structured reconciliation status (Progressing/Ready/Degraded with reason+message).' })
  conditions?: Record<string, unknown>[] | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  observedGeneration?: number | null;

  @ApiProperty()
  branch!: string;

  @ApiProperty()
  environmentId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  serviceId!: string | null;

  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  userId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  startedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  finishedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'External pipeline ID (GitLab or GitHub)' })
  externalPipelineId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Database connection info (type, version, credentials masked)',
    example: { databaseType: 'POSTGRES', databaseVersion: '16', credentials: { user: 'app', dbName: 'app' } },
  })
  databaseInfo?: {
    databaseType: string;
    databaseVersion: string | null;
    credentials: { user?: string; dbName?: string } | null;
  } | null;
}

export class DeploymentProjectSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ type: String })
  repoPath?: string;
}

export class DeploymentServerSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  host!: string;
}

export class DeploymentServiceTargetSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  serviceId!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  port!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  domain!: string | null;

  @ApiProperty({ type: () => DeploymentServerSummaryDto })
  server!: DeploymentServerSummaryDto;
}

export class DeploymentEnvironmentSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'production' })
  name!: string;

  @ApiProperty({ type: () => DeploymentServerSummaryDto })
  server!: DeploymentServerSummaryDto;

  @ApiPropertyOptional({
    type: () => DeploymentServiceTargetSummaryDto,
    isArray: true,
  })
  serviceTargets?: DeploymentServiceTargetSummaryDto[];
}

export class DeploymentServiceSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  type!: string | null;
}

export class DeploymentUserSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  fullName!: string;
}

export class DeploymentDetailedResponseDto extends DeploymentResponseDto {
  @ApiProperty({ type: () => DeploymentProjectSummaryDto })
  project!: DeploymentProjectSummaryDto;

  @ApiProperty({ type: () => DeploymentEnvironmentSummaryDto })
  environment!: DeploymentEnvironmentSummaryDto;

  @ApiProperty({ type: () => DeploymentUserSummaryDto })
  user!: DeploymentUserSummaryDto;

  @ApiPropertyOptional({
    type: () => DeploymentServiceSummaryDto,
    nullable: true,
  })
  service?: DeploymentServiceSummaryDto | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Computed public URL for the deployed service',
  })
  publicUrl?: string | null;
}

export class PaginatedDeploymentsResponseDto {
  @ApiProperty({ type: () => DeploymentDetailedResponseDto, isArray: true })
  data!: DeploymentDetailedResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalPages!: number;
}
