import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { ImpersonationForbidden } from '../../../shared/decorators/impersonation-policy.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import {
  buildAuthCookieClearOptions,
  resolveAuthCookieName,
} from '../../../shared/http/auth-cookie.util';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { DisableUserMfaDto, EnableUserMfaDto } from './dto/user-mfa.dto';
import { UserMfaService } from './user-mfa.service';

@ApiTags('Account MFA')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ImpersonationForbidden()
@Controller('auth/settings/security/mfa')
export class UserMfaController {
  constructor(
    private readonly mfaService: UserMfaService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'État de la MFA facultative du client connecté' })
  getStatus(@GetUser() user: JwtPayload) {
    return this.mfaService.status(user.id);
  }

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: "Démarrer l'enrôlement TOTP facultatif" })
  beginSetup(@GetUser() user: JwtPayload) {
    return this.mfaService.beginSetup(user.id);
  }

  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Activer la MFA facultative après vérification' })
  async enable(
    @Body() dto: EnableUserMfaDto,
    @GetUser() user: JwtPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.mfaService.enable(user.id, dto.code);
    this.clearSessionCookie(response);
    response.setHeader('Cache-Control', 'no-store');
    return result;
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Désactiver la MFA facultative' })
  async disable(
    @Body() dto: DisableUserMfaDto,
    @GetUser() user: JwtPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.mfaService.disable(
      user.id,
      dto.password,
      dto.code,
    );
    this.clearSessionCookie(response);
    response.setHeader('Cache-Control', 'no-store');
    return result;
  }

  private clearSessionCookie(response: Response): void {
    response.clearCookie(
      resolveAuthCookieName(this.configService),
      buildAuthCookieClearOptions(this.configService),
    );
  }
}
