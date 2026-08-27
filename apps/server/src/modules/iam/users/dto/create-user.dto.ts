import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import {
  SOVRACK_PASSWORD_OPENAPI,
  IsSovrackPassword,
  NormalizeEmail,
} from '../../../../shared/validation/identity-validation.util';

/**
 * DTO de création utilisateur par un administrateur.
 */
export class CreateUserDto {
  @ApiProperty({ example: 'dev@deployautomation.local' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Email invalide' })
  @IsNotEmpty({ message: 'Email requis' })
  email: string;

  @ApiProperty({
    example: 'StrongPassword123!',
    ...SOVRACK_PASSWORD_OPENAPI,
  })
  @IsSovrackPassword()
  @IsNotEmpty({ message: 'Mot de passe requis' })
  password: string;

  @ApiProperty({ example: 'John Developer' })
  @IsString({ message: 'Le nom complet doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Nom complet requis' })
  fullName: string;

  @ApiPropertyOptional({ enum: Role, default: Role.MEMBER })
  @IsEnum(Role, { message: 'Rôle invalide' })
  role?: Role;
}
