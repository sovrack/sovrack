import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { NormalizeEmail } from '../../../../shared/validation/identity-validation.util';

/**
 * DTO pour la connexion d'un utilisateur
 */
export class LoginDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'Email invalide' })
  @IsNotEmpty({ message: 'Email requis' })
  email: string;

  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Mot de passe requis' })
  password: string;

  @ApiPropertyOptional({
    description:
      'Uniquement si le client a activé volontairement la MFA : TOTP ou code de secours',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(?:\d{6}|[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2})$/i, {
    message: 'Le second facteur est invalide',
  })
  mfaCode?: string;
}
