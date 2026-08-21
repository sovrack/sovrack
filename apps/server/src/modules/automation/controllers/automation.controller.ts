import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import { GetWorkspaceId } from '../../../shared/decorators/get-workspace-id.decorator';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../../iam/authorization/workspace.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateAutomationRunDto } from '../dto/create-automation-run.dto';
import { AutomationPaginationDto } from '../dto/automation-pagination.dto';
import { AutomationService } from '../services/automation.service';

@ApiTags('Automation')
@ApiBearerAuth()
@Controller(['workspaces/:workspaceId', ''])
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get('automation/actions')
  getActions() {
    return this.automationService.getActions();
  }

  @Get('automation/runs')
  getRuns(
    @GetWorkspaceId() workspaceId: string,
    @Query() pagination: AutomationPaginationDto,
  ) {
    return this.automationService.getRuns(workspaceId, pagination);
  }

  @Get('automation/runs/:id')
  getRun(@Param('id') id: string, @GetWorkspaceId() workspaceId: string) {
    return this.automationService.getRun(id, workspaceId);
  }

  @Get('automation/runs/:id/logs')
  getRunLogs(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
    @Query('afterLine') afterLine?: string,
  ) {
    const parsedAfterLine =
      afterLine && Number.isFinite(Number(afterLine))
        ? Number(afterLine)
        : undefined;
    return this.automationService.getRunLogs(id, workspaceId, parsedAfterLine);
  }

  @Post('automation/runs')
  startRun(
    @Body() dto: CreateAutomationRunDto,
    @GetWorkspaceId() workspaceId: string,
    @GetUser() user: JwtPayload,
  ) {
    return this.automationService.startRun(dto, workspaceId, user.id);
  }

  @Post('automation/runs/:id/cancel')
  cancelRun(
    @Param('id') id: string,
    @GetWorkspaceId() workspaceId: string,
    @GetUser() user: JwtPayload,
  ) {
    return this.automationService.cancelRun(id, workspaceId, user.id);
  }

  @Delete('automation/runs/:id')
  deleteRun(@Param('id') id: string, @GetWorkspaceId() workspaceId: string) {
    return this.automationService.deleteRun(id, workspaceId);
  }
}
