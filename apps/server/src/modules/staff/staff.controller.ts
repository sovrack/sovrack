import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PlatformRole, type Staff } from '@prisma/client';
import { GetStaff } from './staff.decorators';
import { Public } from '../../shared/decorators/public.decorator';
import { StaffJwtAuthGuard, StaffRoles, StaffRolesGuard } from './staff.guards';
import { StaffService } from './staff.service';
import { StaffAuditService } from './staff-audit.service';
import {
  CreateStaffDto,
  StaffLoginDto,
  StaffUpdateUserDto,
  UpdateStaffDto,
} from './dto/staff.dto';
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
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded)) return forwarded[0] ?? null;
  if (forwarded) return forwarded.split(',')[0].trim() ?? null;
  return req.socket?.remoteAddress ?? null;
}

@ApiTags('Back-office (staff)')
@Public()
@Controller('staff')
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
    private readonly configService: ConfigService,
    private readonly auditService: StaffAuditService,
  ) {}

  // ──────────────────────────── AUTH ────────────────────────────

  @Post('login')
  @ApiOperation({ summary: 'Login back-office (staff)' })
  async login(
    @Body() dto: StaffLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.staffService.login(dto, clientIp(req));
    response.cookie(
      resolveStaffAuthCookieName(this.configService),
      result.access_token,
      buildStaffAuthCookieOptions(this.configService),
    );
    return result;
  }

  @Post('logout')
  @UseGuards(StaffJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout back-office (audit)' })
  async logout(
    @GetStaff() staff: Staff,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.clearCookie(
      resolveStaffAuthCookieName(this.configService),
      buildStaffAuthCookieClearOptions(this.configService),
    );
    return this.staffService.logout(staff.id, clientIp(req));
  }

  @Get('me')
  @UseGuards(StaffJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Profil du staff connecté' })
  me(@GetStaff() staff: Staff) {
    return this.staffService.me(staff.id);
  }

  // ──────────────────────── STAFF (back-office) ────────────────────────

  @Get('staff')
  @UseGuards(StaffJwtAuthGuard, StaffRolesGuard)
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
  @UseGuards(StaffJwtAuthGuard, StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer un compte back-office (ROOT uniquement)' })
  createStaff(
    @Body() dto: CreateStaffDto,
    @GetStaff() staff: Staff,
    @Req() req: Request,
  ) {
    return this.staffService.createStaff(dto, staff.id, clientIp(req));
  }

  @Patch('staff/:id')
  @UseGuards(StaffJwtAuthGuard, StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Modifier un compte back-office (ROOT uniquement)' })
  updateStaff(
    @Param('id') id: string,
    @Body() body: UpdateStaffDto,
    @GetStaff() staff: Staff,
    @Req() req: Request,
  ) {
    return this.staffService.updateStaff(
      id,
      {
        role: body.role,
        status: body.status,
        fullName: body.fullName,
        password: body.password,
      },
      staff.id,
      clientIp(req),
    );
  }

  // ──────────────────────────── PLATEFORME ────────────────────────────

  @Get('overview')
  @UseGuards(StaffJwtAuthGuard, StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN, PlatformRole.OPERATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vue globale de la plateforme' })
  getOverview() {
    return this.staffService.getOverview();
  }

  @Get('audit-logs')
  @UseGuards(StaffJwtAuthGuard, StaffRolesGuard)
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
  @UseGuards(StaffJwtAuthGuard, StaffRolesGuard)
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
  @UseGuards(StaffJwtAuthGuard, StaffRolesGuard)
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
  @UseGuards(StaffJwtAuthGuard, StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des abonnements plateforme' })
  listSubscriptions() {
    return this.staffService.listSubscriptions();
  }

  @Patch('users/:id')
  @UseGuards(StaffJwtAuthGuard, StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bloquer/débloquer ou changer le rôle d’un client' })
  updateUser(
    @Param('id') id: string,
    @Body() dto: StaffUpdateUserDto,
    @GetStaff() staff: Staff,
    @Req() req: Request,
  ) {
    return this.staffService.updateUser(id, dto, staff.id, clientIp(req));
  }

  @Delete('users/:id')
  @UseGuards(StaffJwtAuthGuard, StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supprimer définitivement un compte client (ROOT)' })
  deleteUser(
    @Param('id') id: string,
    @GetStaff() staff: Staff,
    @Req() req: Request,
  ) {
    return this.staffService.deleteUser(id, staff.id, clientIp(req));
  }

  @Post('users/:id/impersonate')
  @UseGuards(StaffJwtAuthGuard, StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Se connecter « en tant que » un client — émet un JWT client, journalisé',
  })
  async impersonate(
    @Param('id') id: string,
    @GetStaff() staff: Staff,
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
    return result;
  }
}
