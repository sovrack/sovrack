import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * DTO de mise à jour utilisateur.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John Updated' })
  @IsOptional()
  @IsString({ message: 'Le nom complet doit être une chaîne de caractères' })
  fullName?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role, { message: 'Rôle invalide' })
  role?: Role;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: "Le statut d'activation doit être un booléen" })
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'AncienMotDePasse123!' })
  @IsOptional()
  @IsString({
    message: 'Le mot de passe actuel doit être une chaîne de caractères',
  })
  currentPassword?: string;

  @ApiPropertyOptional({ example: 'NouveauMotDePasse123!' })
  @IsOptional()
  @IsString({
    message: 'Le nouveau mot de passe doit être une chaîne de caractères',
  })
  @MinLength(8, {
    message: 'Le nouveau mot de passe doit contenir au moins 8 caractères',
  })
  newPassword?: string;

  @ApiPropertyOptional({ example: 'NouveauMotDePasse123!' })
  @IsOptional()
  @IsString({
    message: 'La confirmation du mot de passe doit être une chaîne de caractères',
  })
  confirmNewPassword?: string;
}
