import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GitProviderType } from '@prisma/client';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DiscoverGroupDto {
  @ApiProperty({ enum: [GitProviderType.GITLAB, GitProviderType.GITHUB] })
  @IsIn([GitProviderType.GITLAB, GitProviderType.GITHUB])
  provider!: GitProviderType;

  @ApiProperty({ example: 'my-group' })
  @IsString()
  @IsNotEmpty()
  groupPath!: string;

  // Optionnel : si le provider est déjà connecté (providerId fourni), on réutilise
  // le token stocké. Obligatoire seulement pour un provider non connecté.
  @ApiPropertyOptional({ example: '<git-access-token>' })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({ example: 'b5073d11-f378-4c71-87da-093f3ecf20af' })
  @IsOptional()
  @IsString()
  providerId?: string;
}
