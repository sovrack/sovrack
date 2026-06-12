import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { WebhookManagementService } from './webhook-management.service';

/**
 * REST API for managing webhook endpoints at the project (or service) level.
 *
 *   POST /projects/:projectId/webhook/configure   → create/update + register on provider
 *   GET  /projects/:projectId/webhook/status      → current status
 *   POST /projects/:projectId/webhook/pause       → disable incoming events
 *   POST /projects/:projectId/webhook/resume      → re-enable incoming events
 */
@Controller('projects/:projectId/webhook')
@UseGuards(JwtAuthGuard)
export class WebhookManagementController {
  constructor(private readonly webhookService: WebhookManagementService) {}

  @Post('configure')
  async configure(
    @Param('projectId') projectId: string,
    @Query('serviceEnvId') serviceEnvId?: string,
  ) {
    return this.webhookService.configureForProject(projectId, serviceEnvId);
  }

  @Get('status')
  async status(
    @Param('projectId') projectId: string,
    @Query('serviceEnvId') serviceEnvId?: string,
  ) {
    return this.webhookService.getStatus(projectId, serviceEnvId);
  }

  @Post('pause')
  async pause(
    @Param('projectId') projectId: string,
    @Query('serviceEnvId') serviceEnvId?: string,
  ) {
    await this.webhookService.setActive(projectId, false, serviceEnvId);
    return { status: 'paused' };
  }

  @Post('resume')
  async resume(
    @Param('projectId') projectId: string,
    @Query('serviceEnvId') serviceEnvId?: string,
  ) {
    await this.webhookService.setActive(projectId, true, serviceEnvId);
    return { status: 'resumed' };
  }
}
