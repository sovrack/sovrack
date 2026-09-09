import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../shared/decorators/public.decorator';
import {
  buildStaffAuthCookieClearOptions,
  resolveStaffAuthCookieName,
} from '../../shared/http/staff-auth-cookie.util';
import { StaffEnableMfaDto, StaffResetMfaDto } from './dto/staff.dto';
import { GetStaff } from './staff.decorators';
import { StaffJwtAuthGuard, StaffMfaEnrollmentAllowed } from './staff.guards';
import type { StaffJwtPayload } from './staff-jwt.strategy';
import { StaffMfaService } from './staff-mfa.service';

function requestIp(request: Request): string | null {
  return request.ip || request.socket?.remoteAddress || null;
}

@ApiTags('Back-office MFA')
@Public()
@UseGuards(StaffJwtAuthGuard)
@StaffMfaEnrollmentAllowed()
@Controller('staff/settings/security/mfa')
export class StaffMfaController {
  constructor(
    private readonly mfaService: StaffMfaService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'État MFA du staff connecté' })
  getStatus(@GetStaff() staff: StaffJwtPayload) {
    return this.mfaService.status(staff.id);
  }

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Démarrer l'enrôlement TOTP du staff connecté" })
  beginSetup(@GetStaff() staff: StaffJwtPayload, @Req() request: Request) {
    return this.mfaService.beginSetup(staff.id, requestIp(request));
  }

  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vérifier le TOTP et activer la MFA' })
  async enable(
    @Body() dto: StaffEnableMfaDto,
    @GetStaff() staff: StaffJwtPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.mfaService.enable(
      staff.id,
      dto.code,
      requestIp(request),
    );
    response.setHeader('Cache-Control', 'no-store');
    this.clearSessionCookie(response);
    return result;
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Remplacer l'authentificateur MFA actuel" })
  async reset(
    @Body() dto: StaffResetMfaDto,
    @GetStaff() staff: StaffJwtPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.mfaService.reset(
      staff.id,
      dto.password,
      dto.code,
      requestIp(request),
    );
    this.clearSessionCookie(response);
    return result;
  }

  private clearSessionCookie(response: Response): void {
    response.clearCookie(
      resolveStaffAuthCookieName(this.configService),
      buildStaffAuthCookieClearOptions(this.configService),
    );
  }
}
