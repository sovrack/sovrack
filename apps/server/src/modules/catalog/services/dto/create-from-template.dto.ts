import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateFromTemplateDto {
  @ApiProperty({ example: 'my-stack' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de base est requis' })
  name!: string;
}
