import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { GetWorkspaceId } from '../../../shared/decorators/get-workspace-id.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller(['workspaces/:workspaceId/dashboard', 'dashboard'])
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Aggregated dashboard statistics' })
  async getStats(
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return this.dashboard.getStats(user.id, workspaceId);
  }
}
