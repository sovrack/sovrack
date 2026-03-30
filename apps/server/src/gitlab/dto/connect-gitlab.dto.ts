import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class ConnectGitlabDto {
  @ApiProperty({ example: 'https://gitlab.example.com' })
  @IsUrl()
  @IsNotEmpty()
  gitlabUrl!: string;

  @ApiProperty({ example: 'glpat-xxxxxxxxxxxxxxxxxxxx' })
  @IsString()
  @IsNotEmpty()
  gitlabToken!: string;

  @ApiProperty({ example: 123 })
  @IsNumber()
  @IsNotEmpty()
  gitlabId!: number;

  @ApiPropertyOptional({ example: 'main', default: 'main' })
  @IsString()
  @IsOptional()
  defaultBranch?: string;
}
