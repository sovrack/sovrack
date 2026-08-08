import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { PlatformRole, Role } from '@prisma/client';

export class StaffLoginDto {
  @ApiProperty({ example: 'admin@sovrack.tech' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'S3cure-Password!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class CreateStaffDto {
  @ApiProperty({ example: 'nouveau.staff@sovrack.tech' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '8-Chars-Min!' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Le mot de passe doit contenir au moins une lettre et un chiffre',
  })
  password: string;

  @ApiProperty({ example: 'Sami Ben Salah' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiPropertyOptional({ enum: PlatformRole, default: PlatformRole.OPERATOR })
  @IsOptional()
  @IsEnum(PlatformRole)
  role?: PlatformRole;
}

export class UpdateStaffDto {
  @ApiPropertyOptional({ enum: PlatformRole })
  @IsOptional()
  @IsEnum(PlatformRole)
  role?: PlatformRole;

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

  @ApiPropertyOptional({ description: 'Nouveau mot de passe (optionnel)' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
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
