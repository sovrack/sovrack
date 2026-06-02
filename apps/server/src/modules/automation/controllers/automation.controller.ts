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
import { GetUser } from '../../../core/decorators/get-user.decorator';
import type { JwtPayload } from '../../../core/jwt/dto/jwt-payload.dto';
import { Roles } from '../../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { CreateAutomationRunDto } from '../dto/create-automation-run.dto';
import { AutomationService } from '../services/automation.service';

@Controller()
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get('automation/actions')
  getActions() {
    return this.automationService.getActions();
  }

  @Get('automation/runs')
  getRuns(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.automationService.getRuns(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  @Get('automation/runs/:id')
  getRun(@Param('id') id: string) {
    return this.automationService.getRun(id);
  }

  @Get('automation/runs/:id/logs')
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
