import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ManagedServiceType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateManagedServiceDto {
  @ApiProperty({ example: 'prod-postgres' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ManagedServiceType, example: ManagedServiceType.POSTGRES })
  @IsEnum(ManagedServiceType)
  type: ManagedServiceType;

  @ApiPropertyOptional({ example: '15' })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiProperty({ example: 5432 })
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @ApiProperty({ example: 'proj_xxx' })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({ example: 'env_xxx' })
  @IsString()
  @IsNotEmpty()
  environmentId: string;

  @ApiProperty({ example: 'srv_xxx' })
  @IsString()
  @IsNotEmpty()
  serverId: string;
}
