import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import {
  SOVRACK_PASSWORD_OPENAPI,
  IsSovrackPassword,
} from '../../../../shared/validation/identity-validation.util';

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

  @ApiPropertyOptional({
    example: 'NouveauMotDePasse123!',
    ...SOVRACK_PASSWORD_OPENAPI,
  })
  @IsOptional()
  @IsSovrackPassword()
  newPassword?: string;

  @ApiPropertyOptional({ example: 'NouveauMotDePasse123!' })
  @IsOptional()
  @IsString({
    message:
      'La confirmation du mot de passe doit être une chaîne de caractères',
  })
  confirmNewPassword?: string;
}
