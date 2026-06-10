import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { ProjectWebhookService } from './project-webhook.service';

/**
 * REST API for managing webhook endpoints at the project level.
 *
 * POST /projects/:projectId/webhook/configure   → create/update + register on provider
 * GET  /projects/:projectId/webhook/status       → current status
 * POST /projects/:projectId/webhook/pause        → disable incoming events
 * POST /projects/:projectId/webhook/resume       → re-enable incoming events
 */
@Controller('projects/:projectId/webhook')
@UseGuards(JwtAuthGuard)
export class ProjectWebhookController {
  constructor(private readonly webhookService: ProjectWebhookService) {}

  @Post('configure')
  async configure(
    @Param('projectId') projectId: string,
    @Query('serviceId') serviceId?: string,
  ) {
    return this.webhookService.configureForProject(projectId, serviceId);
  }

  @Get('status')
  async status(
    @Param('projectId') projectId: string,
    @Query('serviceId') serviceId?: string,
  ) {
    return this.webhookService.getStatus(projectId, serviceId);
  }

  @Post('pause')
  async pause(
    @Param('projectId') projectId: string,
    @Query('serviceId') serviceId?: string,
  ) {
    await this.webhookService.setActive(projectId, false, serviceId);
    return { status: 'paused' };
  }

  @Post('resume')
  async resume(
    @Param('projectId') projectId: string,
    @Query('serviceId') serviceId?: string,
  ) {
    await this.webhookService.setActive(projectId, true, serviceId);
    return { status: 'resumed' };
  }
}
