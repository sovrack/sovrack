import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateConfigDto {
  @ApiProperty({ example: 'DATABASE_URL' })
  @IsString({ message: 'La clé doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'La clé est obligatoire' })
  key!: string;

  @ApiProperty({ example: 'postgresql://user:pass@host:5432/db' })
  @IsString({ message: 'La valeur doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'La valeur est obligatoire' })
  value!: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'isSecret doit être un booléen' })
  isSecret?: boolean;
}
