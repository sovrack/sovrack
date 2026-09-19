import {
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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@prisma/client';
import type { Request } from 'express';
import { Public } from '../../shared/decorators/public.decorator';
import {
  CreateStaffImpersonationDto,
  StaffListUsersQueryDto,
  StaffListWorkspacesQueryDto,
  StaffScheduleUserDeletionDto,
  StaffUpdateUserDto,
  StaffUpdateWorkspaceStatusDto,
} from './dto/staff.dto';
import { GetStaff } from './staff.decorators';
import { StaffJwtAuthGuard, StaffRoles, StaffRolesGuard } from './staff.guards';
import type { StaffJwtPayload } from './staff-jwt.strategy';
import { StaffService } from './staff.service';
import { StaffAuditService } from './staff-audit.service';

function clientIp(request: Request): string | null {
  return request.ip || request.socket?.remoteAddress || null;
}

/** Customer and workspace administration plane of the Staff API. */
@ApiTags('Back-office — plateforme')
@Public()
@UseGuards(StaffJwtAuthGuard)
@Controller('staff')
export class StaffPlatformController {
  constructor(
    private readonly staffService: StaffService,
    private readonly auditService: StaffAuditService,
  ) {}

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
  @ApiOperation({ summary: 'Liste des identités clientes' })
  listUsers(@Query() query: StaffListUsersQueryDto) {
    return this.staffService.listUsers(query);
  }

  @Get('users/:id')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Détail d'une identité cliente" })
  getUser(@Param('id') id: string) {
    return this.staffService.getUser(id);
  }

  @Get('teams')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des workspaces de la plateforme' })
  listTeams(@Query() query: StaffListWorkspacesQueryDto) {
    return this.staffService.listTeams(query);
  }

  @Get('teams/:id')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Détail d'un workspace et de ses membres" })
  getTeam(@Param('id') id: string) {
    return this.staffService.getTeam(id);
  }

  @Patch('teams/:id/status')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspendre, archiver ou réactiver un workspace' })
  updateTeamStatus(
    @Param('id') id: string,
    @Body() dto: StaffUpdateWorkspaceStatusDto,
    @GetStaff() staff: StaffJwtPayload,
    @Req() request: Request,
  ) {
    return this.staffService.updateTeamStatus(
      id,
      dto.status,
      staff.id,
      clientIp(request),
    );
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
  @ApiOperation({ summary: 'Bloquer ou débloquer une identité cliente' })
  updateUser(
    @Param('id') id: string,
    @Body() dto: StaffUpdateUserDto,
    @GetStaff() staff: StaffJwtPayload,
    @Req() request: Request,
  ) {
    return this.staffService.updateUser(id, dto, staff.id, clientIp(request));
  }

  @Post('users/:id/deletion')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Programmer une suppression avec délai de grâce' })
  scheduleUserDeletion(
    @Param('id') id: string,
    @Body() dto: StaffScheduleUserDeletionDto,
    @GetStaff() staff: StaffJwtPayload,
    @Req() request: Request,
  ) {
    return this.staffService.scheduleUserDeletion(
      id,
      staff.id,
      dto.reason,
      clientIp(request),
    );
  }

  @Delete('users/:id/deletion')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Annuler une suppression programmée' })
  cancelUserDeletion(
    @Param('id') id: string,
    @GetStaff() staff: StaffJwtPayload,
    @Req() request: Request,
  ) {
    return this.staffService.cancelUserDeletion(
      id,
      staff.id,
      clientIp(request),
    );
  }

  @Post('users/:id/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Révoquer toutes les sessions d'une identité" })
  revokeUserSessions(
    @Param('id') id: string,
    @GetStaff() staff: StaffJwtPayload,
    @Req() request: Request,
  ) {
    return this.staffService.revokeUserSessions(
      id,
      staff.id,
      clientIp(request),
    );
  }

  @Post('users/:id/impersonate')
  @UseGuards(StaffRolesGuard)
  @StaffRoles(PlatformRole.ROOT, PlatformRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer une assistance éphémère et journalisée' })
  impersonate(
    @Param('id') id: string,
    @Body() dto: CreateStaffImpersonationDto,
    @GetStaff() staff: StaffJwtPayload,
    @Req() request: Request,
  ) {
    return this.staffService.impersonateUser(
      id,
      staff.id,
      dto.reason,
      clientIp(request),
    );
  }
}
