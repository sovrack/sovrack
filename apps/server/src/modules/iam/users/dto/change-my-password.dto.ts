import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangeMyPasswordDto {
  @ApiProperty({ example: 'AncienMotDePasse123!' })
  @IsString({
    message: 'Le mot de passe actuel doit être une chaîne de caractères',
  })
  currentPassword!: string;

  @ApiProperty({ example: 'NouveauMotDePasse123!' })
  @IsString({
    message: 'Le nouveau mot de passe doit être une chaîne de caractères',
  })
  @MinLength(8, {
    message: 'Le nouveau mot de passe doit contenir au moins 8 caractères',
  })
  newPassword!: string;

  @ApiProperty({ example: 'NouveauMotDePasse123!' })
  @IsString({
    message:
      'La confirmation du mot de passe doit être une chaîne de caractères',
  })
  confirmNewPassword!: string;
}
