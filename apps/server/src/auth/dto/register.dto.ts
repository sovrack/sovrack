import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * DTO pour l'enregistrement d'un nouvel utilisateur
 */
export class RegisterDto {
  @IsEmail({}, { message: 'Email invalide' })
  @IsNotEmpty({ message: 'Email requis' })
  email: string;

  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @MinLength(8, {
    message: 'Le mot de passe doit contenir au moins 8 caractères',
  })
  @IsNotEmpty({ message: 'Mot de passe requis' })
  password: string;

  @IsString({ message: 'Le nom complet doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Nom complet requis' })
  fullName: string;
}
