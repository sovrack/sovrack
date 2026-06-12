import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'App E-commerce' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Application e-commerce interne' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: '0fca8a5f-4f31-43fc-a5a8-d4f07102e8dd',
    description: 'Utilisateur DEVELOPER à assigner comme OWNER',
  })
  @IsOptional()
  @IsUUID('4')
  ownerId?: string;
}
