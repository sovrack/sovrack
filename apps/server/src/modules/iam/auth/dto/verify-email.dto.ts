import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * DTO de vérification d'email — reçoit le code à 6 chiffres envoyé à l'adresse.
 */
export class VerifyEmailDto {
  @ApiProperty({ example: 'dev@sovrack.tech' })
  @IsEmail({}, { message: 'Email invalide' })
  @IsNotEmpty({ message: 'Email requis' })
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString({ message: 'Le code doit être une chaîne de caractères' })
  @Matches(/^\d{6}$/, {
    message: 'Le code doit contenir exactement 6 chiffres',
  })
  @IsNotEmpty({ message: 'Code requis' })
  code: string;
}
