import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * DTO d'inscription publique — crée un compte (User + Team + essai billing).
 */
export class RegisterDto {
  @ApiProperty({ example: 'dev@sovrack.tn' })
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

  @ApiProperty({ example: 'Ma première équipe' })
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: "Nom de l'équipe requis" })
  teamName: string;
}
