import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';
import type { SmtpSecurityMode } from '../../notifications/notifications-config.service';

export class UpdateStaffEmailSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @MaxLength(253)
  host!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  port!: number;

  @IsIn(['none', 'starttls', 'tls'])
  security!: SmtpSecurityMode;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  user?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  password?: string;

  @IsOptional()
  @IsBoolean()
  clearPassword?: boolean;

  @IsString()
  @MaxLength(512)
  @Matches(/^[^\r\n]*$/)
  from!: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  @Matches(/^[^\r\n]*$/)
  to?: string;
}

export class TestStaffEmailSettingsDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  recipient?: string;
}
