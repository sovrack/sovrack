import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeploymentStatus, EnvName } from '@prisma/client';

export class DeploymentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: DeploymentStatus })
  status!: DeploymentStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  logs!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  dockerImage!: string | null;

  @ApiProperty()
  branch!: string;

  @ApiProperty()
  environmentId!: string;

  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  userId!: string;

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

export class DeploymentProjectSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ type: String })
  gitlabUrl?: string;
}

export class DeploymentServerSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  host!: string;
}

export class DeploymentEnvironmentSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: EnvName })
  name!: EnvName;

  @ApiProperty({ type: () => DeploymentServerSummaryDto })
  server!: DeploymentServerSummaryDto;
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
