import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class EnableUserMfaDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Le code TOTP doit contenir 6 chiffres' })
  code!: string;
}

export class DisableUserMfaDto {
  @ApiProperty({ example: 'Votre mot de passe' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiProperty({
    description: 'Code TOTP ou code de secours à usage unique',
    example: '123456',
  })
  @IsString()
  @Matches(/^(?:\d{6}|[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2})$/i, {
    message: 'Le second facteur est invalide',
  })
  code!: string;
}
