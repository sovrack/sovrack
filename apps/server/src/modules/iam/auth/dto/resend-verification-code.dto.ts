import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsUUID } from 'class-validator';

/**
 * DTO de renvoi du code de vérification d'email.
 */
export class ResendVerificationCodeDto {
  @ApiProperty({ example: 'dev@sovrack.tech' })
  @IsEmail({}, { message: 'Email invalide' })
  @IsNotEmpty({ message: 'Email requis' })
  email: string;

  @ApiProperty({ example: '77a0b42f-f7af-41f0-a1a2-2f89095b9fd3' })
  @IsUUID('4', { message: "Identifiant d'inscription invalide" })
  registrationId: string;
}
