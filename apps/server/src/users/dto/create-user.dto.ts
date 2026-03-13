import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * DTO de création utilisateur par un administrateur.
 */
export class CreateUserDto {
  @ApiProperty({ example: 'dev@devops.com' })
  @IsEmail({}, { message: 'Email invalide' })
  @IsNotEmpty({ message: 'Email requis' })
  email: string;

  @ApiProperty({ example: 'StrongPassword123!' })
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @MinLength(8, {
    message: 'Le mot de passe doit contenir au moins 8 caractères',
  })
  @IsNotEmpty({ message: 'Mot de passe requis' })
  password: string;

  @ApiProperty({ example: 'John Developer' })
  @IsString({ message: 'Le nom complet doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Nom complet requis' })
  fullName: string;

  @ApiPropertyOptional({ enum: Role, default: Role.DEVELOPER })
  @IsEnum(Role, { message: 'Rôle invalide' })
  role?: Role;
}
