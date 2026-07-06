import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ServerPreparationProfile,
  ServerRunStatus,
  ServerRunStepStatus,
  ServerLogLevel,
} from '@prisma/client';

export class ServerSetupTaskDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  setupId!: string;

  @ApiProperty()
  roleKey!: string;

  @ApiProperty()
  taskName!: string;

  @ApiProperty()
  orderIndex!: number;

  @ApiProperty({ enum: ServerRunStepStatus })
  status!: ServerRunStepStatus;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  startedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  finishedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  message!: string | null;
}

export class ServerSetupDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  serverId!: string;

  @ApiProperty({ enum: ServerRunStatus })
  status!: ServerRunStatus;

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
  retryOfSetupId!: string | null;

  @ApiProperty({ type: () => ServerSetupTaskDto, isArray: true })
  tasks!: ServerSetupTaskDto[];
}

export class ServerSetupLogDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  setupId!: string;

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

export class ServerSetupReadinessChecksDto {
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
  noActiveSetup!: boolean;
}

export class ServerSetupReadinessDto {
  @ApiProperty()
  serverId!: string;

  @ApiProperty()
  isReady!: boolean;

  @ApiProperty({ type: () => ServerSetupReadinessChecksDto })
  checks!: ServerSetupReadinessChecksDto;

  @ApiProperty({ type: [String] })
  blockingReasons!: string[];

  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  latestValidationAt!: string | null;
}
