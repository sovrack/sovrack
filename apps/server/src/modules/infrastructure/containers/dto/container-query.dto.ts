import { IsOptional, IsString, IsInt, IsBoolean, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ContainerLogsQueryDto {
  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tail?: number = 100;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  follow?: boolean;
}

export class ContainerListQueryDto {
  @ApiPropertyOptional({ example: 'srv_xxx' })
  @IsOptional()
  @IsString()
  serverId?: string;

  @ApiPropertyOptional({ example: 'svc_xxx' })
  @IsOptional()
  @IsString()
  serviceId?: string;

  @ApiPropertyOptional({ example: 'dep_xxx' })
  @IsOptional()
  @IsString()
  deploymentId?: string;

  @ApiPropertyOptional({ example: 'senv_xxx' })
  @IsOptional()
  @IsString()
  serviceEnvId?: string;
}
