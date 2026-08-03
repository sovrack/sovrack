import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { SuperAdminService } from './super-admin.service';

@ApiTags('Super Admin')
@ApiBearerAuth()
@Controller('super-admin')
@Roles(Role.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuperAdminController {
  constructor(private readonly superAdmin: SuperAdminService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Global platform overview (back-office)' })
  getOverview() {
    return this.superAdmin.getOverview();
  }

  @Get('users')
  @ApiOperation({ summary: 'List all platform users' })
  listUsers(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.superAdmin.listUsers({
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('teams')
  @ApiOperation({ summary: 'List all platform teams' })
  listTeams(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.superAdmin.listTeams({
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'List all subscriptions across the platform' })
  listSubscriptions() {
    return this.superAdmin.listSubscriptions();
  }

  @Get('teams/:teamId/users')
  @ApiOperation({ summary: 'List members of a given team' })
  listUsersForTeam(@Param('teamId') teamId: string) {
    return this.superAdmin.listUsersForTeam(teamId);
  }
}
