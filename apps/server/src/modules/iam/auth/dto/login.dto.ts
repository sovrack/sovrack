import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO pour la connexion d'un utilisateur
 */
export class LoginDto {
  @IsEmail({}, { message: 'Email invalide' })
  @IsNotEmpty({ message: 'Email requis' })
  email: string;

  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Mot de passe requis' })
  password: string;
}
