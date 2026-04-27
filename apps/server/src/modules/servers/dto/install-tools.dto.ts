import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class InstallToolsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  docker?: boolean;

  @ApiPropertyOptional({
    example: false,
    deprecated: true,
    description:
      'Ignored. Ansible is never installed on target VPS; it runs only from the control node.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ansible?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  runner?: boolean;
}
