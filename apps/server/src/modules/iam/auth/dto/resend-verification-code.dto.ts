import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

/**
 * DTO de renvoi du code de vérification d'email.
 */
export class ResendVerificationCodeDto {
  @ApiProperty({ example: 'dev@sovrack.tech' })
  @IsEmail({}, { message: 'Email invalide' })
  @IsNotEmpty({ message: 'Email requis' })
  email: string;
}
