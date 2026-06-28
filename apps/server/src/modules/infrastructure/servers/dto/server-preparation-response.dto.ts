import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ServerPreparationProfile,
  ServerRunStatus,
  ServerRunStepStatus,
  ServerLogLevel,
} from '@prisma/client';

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

  @ApiProperty({ enum: ServerRunStepStatus })
  status!: ServerRunStepStatus;

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
