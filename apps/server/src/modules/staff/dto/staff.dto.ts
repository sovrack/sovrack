import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Matches,
  MinLength,
  Min,
} from 'class-validator';
import { PlatformRole, WorkspaceStatus, WorkspaceType } from '@prisma/client';
import {
  SOVRACK_PASSWORD_OPENAPI,
  IsSovrackPassword,
  NormalizeEmail,
} from '../../../shared/validation/identity-validation.util';

export class StaffLoginDto {
  @ApiProperty({ example: 'contact@sovrack.tech' })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3cure-Password!' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({
    description: 'Code TOTP à 6 chiffres ou code de secours à usage unique',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(?:\d{6}|[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2})$/i, {
    message: 'Le second facteur doit être un TOTP ou un code de secours valide',
  })
  mfaCode?: string;
}

export class StaffEnableMfaDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Le code TOTP doit contenir 6 chiffres' })
  code: string;
}

export class StaffResetMfaDto {
  @ApiProperty({ example: 'S3cure-Password!' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    description: 'Code TOTP à 6 chiffres ou code de secours à usage unique',
    example: '123456',
  })
  @IsString()
  @Matches(/^(?:\d{6}|[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2})$/i, {
    message: 'Le second facteur doit être un TOTP ou un code de secours valide',
  })
  code: string;
}

export class StaffForgotPasswordDto {
  @ApiProperty({ example: 'contact@sovrack.tech' })
  @NormalizeEmail()
  @IsEmail()
  email: string;
}

export class StaffResetPasswordDto {
  @ApiProperty({ example: 'contact@sovrack.tech' })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty({ example: '12345678', minLength: 8, maxLength: 8 })
  @IsString()
  @Matches(/^\d{8}$/, {
    message: 'Le code doit contenir exactement 8 chiffres',
  })
  code: string;

  @ApiProperty(SOVRACK_PASSWORD_OPENAPI)
  @IsSovrackPassword()
  password: string;
}

export class ExchangeStaffImpersonationDto {
  @ApiProperty({
    description: "Autorisation d'assistance éphémère reçue du back-office",
  })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token: string;
}

export class CreateStaffImpersonationDto {
  @ApiProperty({
    description:
      "Motif opérationnel obligatoire, conservé dans le journal d'audit",
    example: 'Diagnostic du déploiement signalé par le client dans INC-142',
    minLength: 10,
    maxLength: 500,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}

export class CreateStaffDto {
  @ApiProperty({ example: 'nouveau.staff@sovrack.tech' })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Sami Ben Salah' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiPropertyOptional({
    enum: [PlatformRole.ADMIN, PlatformRole.OPERATOR],
    default: PlatformRole.OPERATOR,
    description: 'ROOT est réservé au bootstrap initial et n’est pas délégable',
  })
  @IsOptional()
  @IsIn([PlatformRole.ADMIN, PlatformRole.OPERATOR])
  role?: Exclude<PlatformRole, 'ROOT'>;
}

export class AcceptStaffInvitationDto {
  @ApiProperty({ example: 'contact@sovrack.tech' })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty({ example: '12345678', minLength: 8, maxLength: 8 })
  @IsString()
  @Matches(/^\d{8}$/, {
    message: 'Le code doit contenir exactement 8 chiffres',
  })
  code: string;

  @ApiProperty(SOVRACK_PASSWORD_OPENAPI)
  @IsSovrackPassword()
  password: string;
}

export class RequestStaffActivationCodeDto {
  @ApiProperty({ example: 'contact@sovrack.tech' })
  @NormalizeEmail()
  @IsEmail()
  email: string;
}

export class UpdateStaffDto {
  @ApiPropertyOptional({
    enum: [PlatformRole.ADMIN, PlatformRole.OPERATOR],
    description: 'Le rôle ROOT est immuable et réservé au bootstrap initial',
  })
  @IsOptional()
  @IsIn([PlatformRole.ADMIN, PlatformRole.OPERATOR])
  role?: Exclude<PlatformRole, 'ROOT'>;

  @ApiPropertyOptional({
    description: 'Statut du compte staff (ACTIVE / DISABLED / BLOCKED)',
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'DISABLED', 'BLOCKED'])
  status?: 'ACTIVE' | 'DISABLED' | 'BLOCKED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;
}

/** Mise à jour d'un utilisateur CLIENT depuis le back-office. */
export class StaffUpdateUserDto {
  @ApiPropertyOptional({
    description: 'Désactiver (false) ou réactiver (true)',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class StaffScheduleUserDeletionDto {
  @ApiProperty({
    description: 'Motif opérationnel conservé dans le journal append-only',
    minLength: 10,
    maxLength: 500,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class StaffUpdateWorkspaceStatusDto {
  @ApiProperty({
    enum: [
      WorkspaceStatus.ACTIVE,
      WorkspaceStatus.SUSPENDED,
      WorkspaceStatus.ARCHIVED,
    ],
  })
  @IsIn([
    WorkspaceStatus.ACTIVE,
    WorkspaceStatus.SUSPENDED,
    WorkspaceStatus.ARCHIVED,
  ])
  status!: WorkspaceStatus;
}

export class StaffListUsersQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    enum: ['active', 'disabled', 'deletion-scheduled'],
  })
  @IsOptional()
  @IsIn(['active', 'disabled', 'deletion-scheduled'])
  status?: 'active' | 'disabled' | 'deletion-scheduled';
}

export class StaffListWorkspacesQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: WorkspaceType })
  @IsOptional()
  @IsEnum(WorkspaceType)
  type?: WorkspaceType;

  @ApiPropertyOptional({ enum: WorkspaceStatus })
  @IsOptional()
  @IsEnum(WorkspaceStatus)
  status?: WorkspaceStatus;
}
