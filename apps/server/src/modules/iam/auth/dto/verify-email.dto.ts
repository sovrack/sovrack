import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { NormalizeEmail } from '../../../../shared/validation/identity-validation.util';

/**
 * DTO de vérification d'email — reçoit le code à 6 chiffres envoyé à l'adresse.
 */
export class VerifyEmailDto {
  @ApiProperty({ example: 'utilisateur@example.com' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'Email invalide' })
  @IsNotEmpty({ message: 'Email requis' })
  email: string;

  @ApiProperty({ example: '77a0b42f-f7af-41f0-a1a2-2f89095b9fd3' })
  @IsUUID('4', { message: "Identifiant d'inscription invalide" })
  registrationId: string;

  @ApiProperty({ example: '123456' })
  @IsString({ message: 'Le code doit être une chaîne de caractères' })
  @Matches(/^\d{6}$/, {
    message: 'Le code doit contenir exactement 6 chiffres',
  })
  @IsNotEmpty({ message: 'Code requis' })
  code: string;
}
