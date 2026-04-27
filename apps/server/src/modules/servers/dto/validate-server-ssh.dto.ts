import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ValidateServerSshDto {
  @ApiPropertyOptional({
    example: true,
    description:
      'When true, refresh host fingerprint metadata if the control node can read it.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  refreshFingerprint?: boolean;
}
