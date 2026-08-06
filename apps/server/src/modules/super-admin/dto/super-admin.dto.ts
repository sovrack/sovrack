import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateSuperAdminUserDto {
  @ApiPropertyOptional({ enum: Role, description: 'Nouveau rôle plateforme' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    description: 'Désactiver (false) ou réactiver (true) le compte',
  })
  @IsOptional()
  isActive?: boolean;
}

export class ParamIdDto {
  @ApiProperty({ example: '00000000-0000-4000-8000-000000000001' })
  @IsString()
  id: string;
}
