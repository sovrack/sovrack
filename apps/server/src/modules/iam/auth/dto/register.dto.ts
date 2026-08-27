import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import {
  SOVRACK_PASSWORD_OPENAPI,
  IsSovrackPassword,
  NormalizeEmail,
} from '../../../../shared/validation/identity-validation.util';

/**
 * DTO d'inscription publique — crée un compte (User + Team + essai billing).
 */
export class RegisterDto {
  @ApiProperty({ example: 'dev@sovrack.tech' })
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

  @ApiProperty({ example: 'Ma première équipe' })
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: "Nom de l'équipe requis" })
  teamName: string;
}
