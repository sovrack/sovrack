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
import { Role } from '@prisma/client';
import { GetUser } from '../../../shared/decorators/get-user.decorator';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateAutomationRunDto } from '../dto/create-automation-run.dto';
import { AutomationPaginationDto } from '../dto/automation-pagination.dto';
import { AutomationService } from '../services/automation.service';

@ApiTags('Automation')
@ApiBearerAuth()
@Controller()
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get('automation/actions')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  getActions() {
    return this.automationService.getActions();
  }

  @Get('automation/runs')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  getRuns(@Query() pagination: AutomationPaginationDto) {
    return this.automationService.getRuns(pagination);
  }

  @Get('automation/runs/:id')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  getRun(@Param('id') id: string) {
    return this.automationService.getRun(id);
  }

  @Get('automation/runs/:id/logs')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  getRunLogs(@Param('id') id: string, @Query('afterLine') afterLine?: string) {
    const parsedAfterLine =
      afterLine && Number.isFinite(Number(afterLine))
        ? Number(afterLine)
        : undefined;
    return this.automationService.getRunLogs(id, parsedAfterLine);
  }

  @Post('automation/runs')
  startRun(@Body() dto: CreateAutomationRunDto, @GetUser() user: JwtPayload) {
    return this.automationService.startRun(dto, user.id);
  }

  @Post('automation/runs/:id/cancel')
  cancelRun(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return this.automationService.cancelRun(id, user.id);
  }

  @Delete('automation/runs/:id')
  deleteRun(@Param('id') id: string) {
    return this.automationService.deleteRun(id);
  }
}
