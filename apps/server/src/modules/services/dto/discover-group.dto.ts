import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GitProviderType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DiscoverGroupDto {
  @ApiProperty({ enum: GitProviderType })
  @IsEnum(GitProviderType)
  provider!: GitProviderType;

  @ApiProperty({ example: 'my-group' })
  @IsString()
  @IsNotEmpty()
  groupPath!: string;

  @ApiProperty({ example: 'glpat-xxx' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional({ example: 'b5073d11-f378-4c71-87da-093f3ecf20af' })
  @IsOptional()
  @IsString()
  providerId?: string;
}
