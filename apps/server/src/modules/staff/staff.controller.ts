import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  Put,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PlatformRole } from '@prisma/client';
import type { StaffJwtPayload } from './staff-jwt.strategy';
import { GetStaff } from './staff.decorators';
import { Public } from '../../shared/decorators/public.decorator';
import {
  StaffJwtAuthGuard,
  StaffPublic,
  StaffRoles,
  StaffRolesGuard,
} from './staff.guards';
import { StaffService } from './staff.service';
import { StaffPasswordRecoveryService } from './staff-password-recovery.service';
import { StaffAuditService } from './staff-audit.service';
import {
  AcceptStaffInvitationDto,
  RequestStaffActivationCodeDto,
  CreateStaffDto,
  StaffForgotPasswordDto,
  StaffLoginDto,
  StaffResetPasswordDto,
  StaffUpdateUserDto,
  UpdateStaffDto,
} from './dto/staff.dto';
import {
  TestStaffEmailSettingsDto,
  UpdateStaffEmailSettingsDto,
} from './dto/staff-email-settings.dto';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildStaffAuthCookieClearOptions,
  buildStaffAuthCookieOptions,
  resolveStaffAuthCookieName,
} from '../../shared/http/staff-auth-cookie.util';
import {
  buildAuthCookieOptions as buildClientAuthCookieOptions,
  resolveAuthCookieName as resolveClientAuthCookieName,
} from '../../shared/http/auth-cookie.util';

function clientIp(req: Request): string | null {
  return req.ip || req.socket?.remoteAddress || null;
}

@ApiTags('Back-office (staff)')
@Public()
@UseGuards(StaffJwtAuthGuard)
@Controller('staff')
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
    private readonly passwordRecovery: StaffPasswordRecoveryService,
    private readonly configService: ConfigService,
    private readonly auditService: StaffAuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ──────────────────────────── AUTH ────────────────────────────

  @Post('login')
  @StaffPublic()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Login back-office (staff)' })
  async login(
    @Body() dto: StaffLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.staffService.login(
      dto,
      clientIp(req),
      req.get('user-agent'),
    );
    response.cookie(
      resolveStaffAuthCookieName(this.configService),
      result.access_token,
      buildStaffAuthCookieOptions(this.configService),
    );
    return { staff: result.staff };
  }

  @Post('forgot-password')
  @StaffPublic()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 600_000, limit: 3 } })
  @ApiOperation({ summary: 'Demander un code de récupération Staff' })
  forgotPassword(@Body() dto: StaffForgotPasswordDto, @Req() req: Request) {
    return this.passwordRecovery.forgotPassword(dto, clientIp(req));
  }

  @Post('reset-password')
  @StaffPublic()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 600_000, limit: 5 } })
  @ApiOperation({ summary: 'Réinitialiser le mot de passe Staff' })
  resetPassword(@Body() dto: StaffResetPasswordDto, @Req() req: Request) {
    return this.passwordRecovery.resetPassword(dto, clientIp(req));
  }

  @Post('activate')
  @StaffPublic()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary: 'Activer un compte staff avec le code reçu par email',
  })
  acceptInvitation(@Body() dto: AcceptStaffInvitationDto, @Req() req: Request) {
    return this.staffService.acceptStaffInvitation(dto, clientIp(req));
  }

  @Post('request-activation-code')
  @StaffPublic()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 600_000, limit: 3 } })
  @ApiOperation({ summary: "Demander un nouveau code d'activation Staff" })
  requestActivationCode(
    @Body() dto: RequestStaffActivationCodeDto,
    @Req() req: Request,
  ) {
    return this.staffService.requestStaffActivationCode(
      dto.email,
      clientIp(req),
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout back-office (audit)' })
  async logout(
    @GetStaff() staff: StaffJwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.clearCookie(
      resolveStaffAuthCookieName(this.configService),
      buildStaffAuthCookieClearOptions(this.configService),
    );
    return this.staffService.logout(staff.id, staff.sid, clientIp(req));
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profil du staff connecté' })
  me(@GetStaff() staff: StaffJwtPayload) {
    return this.staffService.me(staff.id);
  }

  // ──────────────────────── STAFF (back-office) ────────────────────────

  @Get('staff')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des comptes back-office' })
  listStaff(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.staffService.listStaff({
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Post('staff')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un compte back-office (ROOT uniquement)' })
  createStaff(
    @Body() dto: CreateStaffDto,
    @GetStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    return this.staffService.createStaff(dto, staff.id, clientIp(req));
  }

  @Patch('staff/:id')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier un compte back-office (ROOT uniquement)' })
  updateStaff(
    @Param('id') id: string,
    @Body() body: UpdateStaffDto,
    @GetStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    return this.staffService.updateStaff(
      id,
      {
        role: body.role,
        status: body.status,
        fullName: body.fullName,
      },
      staff.id,
      clientIp(req),
    );
  }

  @Post('staff/:id/invitation')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Renvoyer l'invitation d'un compte staff" })
  resendStaffInvitation(
    @Param('id') id: string,
    @GetStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    return this.staffService.resendStaffInvitation(id, staff.id, clientIp(req));
  }

  // ──────────────────── CONFIGURATION EMAIL GLOBALE ─────────────────────

  @Get('settings/email')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Voir la configuration SMTP sans jamais lire le secret',
  })
  getEmailSettings() {
    return this.notifications.getStaffEmailSettings();
  }

  @Put('settings/email')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier la configuration SMTP globale (ROOT)' })
  async updateEmailSettings(
    @Body() dto: UpdateStaffEmailSettingsDto,
    @GetStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    const before = await this.notifications.getStaffEmailSettings();
    const after = await this.notifications.saveStaffEmailSettings(dto);
    await this.auditService.record({
      staffId: staff.id,
      action: 'platform.email.settings.update',
      resource: 'platform-email-settings',
      before,
      after,
      ip: clientIp(req),
    });
    return after;
  }

  @Post('settings/email/test')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tester SMTP vers le staff connecté' })
  async testEmailSettings(
    @Body() dto: TestStaffEmailSettingsDto,
    @GetStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    const recipient = dto.recipient?.trim().toLowerCase() ?? staff.email;
    if (recipient !== staff.email.toLowerCase()) {
      throw new BadRequestException(
        'Le test SMTP doit être envoyé au staff connecté',
      );
    }
    try {
      await this.notifications.testStaffEmailSettings(recipient);
      await this.auditService.record({
        staffId: staff.id,
        action: 'platform.email.settings.test',
        resource: 'platform-email-settings',
        after: { recipient, status: 'success' },
        ip: clientIp(req),
      });
      return { delivered: true, recipient };
    } catch (error: unknown) {
      await this.auditService.record({
        staffId: staff.id,
        action: 'platform.email.settings.test',
        resource: 'platform-email-settings',
        after: { recipient, status: 'failed' },
        ip: clientIp(req),
      });
      throw error;
    }
  }

  // ──────────────────────────── PLATEFORME ────────────────────────────

  @Get('overview')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN, PlatformRole.OPERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vue globale de la plateforme' })
  getOverview() {
    return this.staffService.getOverview();
  }

  @Get('audit-logs')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Journal d’audit du back-office (append-only)' })
  getAuditLogs(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.auditService.list({
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('users')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des utilisateurs clients' })
  listUsers(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.staffService.listUsers({
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('teams')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des équipes plateforme' })
  listTeams(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.staffService.listTeams({
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('subscriptions')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des abonnements plateforme' })
  listSubscriptions() {
    return this.staffService.listSubscriptions();
  }

  @Patch('users/:id')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bloquer/débloquer ou changer le rôle d’un client' })
  updateUser(
    @Param('id') id: string,
    @Body() dto: StaffUpdateUserDto,
    @GetStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    return this.staffService.updateUser(id, dto, staff.id, clientIp(req));
  }

  @Delete('users/:id')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer définitivement un compte client (ROOT)' })
  deleteUser(
    @Param('id') id: string,
    @GetStaff() staff: StaffJwtPayload,
    @Req() req: Request,
  ) {
    return this.staffService.deleteUser(id, staff.id, clientIp(req));
  }

  @Post('users/:id/impersonate')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Se connecter « en tant que » un client — émet un JWT client, journalisé',
  })
  async impersonate(
    @Param('id') id: string,
    @GetStaff() staff: StaffJwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.staffService.impersonateUser(
      id,
      staff.id,
      clientIp(req),
    );
    // Le token est un JWT CLIENT : on pose le cookie de session client pour que
    // le frontend bascule immédiatement sur le compte cible.
    response.cookie(
      resolveClientAuthCookieName(this.configService),
      result.access_token,
      buildClientAuthCookieOptions(this.configService),
    );
    return { user: result.user, expiresInSeconds: 900 };
  }
}
