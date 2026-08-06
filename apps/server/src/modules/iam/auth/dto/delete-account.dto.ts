import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    example: '123456',
    description: 'Code de confirmation reçu par email',
  })
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'Le code doit contenir exactement 6 chiffres',
  })
  code: string;
}
