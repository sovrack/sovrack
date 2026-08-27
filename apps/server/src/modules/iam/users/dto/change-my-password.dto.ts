import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import {
  SOVRACK_PASSWORD_OPENAPI,
  IsSovrackPassword,
} from '../../../../shared/validation/identity-validation.util';

export class ChangeMyPasswordDto {
  @ApiProperty({ example: 'AncienMotDePasse123!' })
  @IsString({
    message: 'Le mot de passe actuel doit être une chaîne de caractères',
  })
  currentPassword!: string;

  @ApiProperty({
    example: 'NouveauMotDePasse123!',
    ...SOVRACK_PASSWORD_OPENAPI,
  })
  @IsSovrackPassword()
  newPassword!: string;

  @ApiProperty({ example: 'NouveauMotDePasse123!' })
  @IsString({
    message:
      'La confirmation du mot de passe doit être une chaîne de caractères',
  })
  confirmNewPassword!: string;
}
