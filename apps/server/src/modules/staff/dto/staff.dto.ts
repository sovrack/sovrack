import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { PlatformRole, Role } from '@prisma/client';
import {
  SOVRACK_PASSWORD_OPENAPI,
  IsSovrackPassword,
  NormalizeEmail,
} from '../../../shared/validation/identity-validation.util';

export class StaffLoginDto {
  @ApiProperty({ example: 'admin@sovrack.tech' })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3cure-Password!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class StaffForgotPasswordDto {
  @ApiProperty({ example: 'admin@sovrack.tech' })
  @NormalizeEmail()
  @IsEmail()
  email: string;
}

export class StaffResetPasswordDto {
  @ApiProperty({ example: 'admin@sovrack.tech' })
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
  @ApiProperty({ example: 'admin@sovrack.tech' })
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
  @ApiProperty({ example: 'admin@sovrack.tech' })
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
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    description: 'Désactiver (false) ou réactiver (true)',
  })
  @IsOptional()
  isActive?: boolean;
}
