import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateVolumeDto {
  @ApiProperty({ example: 'postgres-data' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'srv_xxx' })
  @IsString()
  @IsNotEmpty()
  serverId: string;

  @ApiPropertyOptional({ example: '/var/lib/postgresql/data' })
  @IsOptional()
  @IsString()
  mountPath?: string;

  @ApiPropertyOptional({ example: 10, description: 'Taille en Go' })
  @IsOptional()
  @IsInt()
  @Min(1)
  sizeGb?: number;

  @ApiPropertyOptional({ example: 'svc_xxx' })
  @IsOptional()
  @IsString()
  serviceId?: string;
}

export class UpdateVolumeDto {
  @ApiPropertyOptional({ example: '/data' })
  @IsOptional()
  @IsString()
  mountPath?: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sizeGb?: number;
}
