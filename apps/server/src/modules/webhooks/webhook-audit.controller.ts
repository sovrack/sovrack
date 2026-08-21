import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WebhookEventStatus } from '@prisma/client';
import { GetUser } from '../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { WorkspaceAccessService } from '../iam/authorization/workspace-access.service';
import { ProjectWorkspaceGuard } from '../iam/authorization/project-workspace.guard';
import { ProjectActions } from '../iam/authorization/workspace-policy.types';
import { WebhooksService } from './webhooks.service';
import { WebhookRetryService } from './services/webhook-retry.service';

/**
 * Read-only / admin API for the webhook observability layer. The write
 * path (recording events) is internal to {@link IncomingWebhookController};
 * this controller only serves the admin / audit UI.
 *
 *   GET   /projects/:id/webhooks/endpoints
 *   GET   /projects/:id/webhooks/events
 *   GET   /projects/:id/webhooks/events/:eventId
 *   PATCH /projects/:id/webhooks/endpoints/:endpointId/enabled
 */
@ApiTags('Webhooks')
@ApiBearerAuth()
@Controller([
  'workspaces/:workspaceId/projects/:id/webhooks',
  'projects/:id/webhooks',
])
@UseGuards(JwtAuthGuard, ProjectWorkspaceGuard)
export class WebhookAuditController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly retryService: WebhookRetryService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  @Get('endpoints')
  async listEndpoints(
    @Param('id') projectId: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.workspaceAccess.assertProjectAction(
      projectId,
      user.id,
      ProjectActions.READ,
    );
    return this.webhooksService.listEndpointsForProject(projectId);
  }

  @Get('events')
  async listEvents(
    @Param('id') projectId: string,
    @GetUser() user: JwtPayload,
    @Query('status') status?: WebhookEventStatus,
    @Query('limit') limit?: string,
  ) {
    await this.workspaceAccess.assertProjectAction(
      projectId,
      user.id,
      ProjectActions.READ,
    );
    const parsedLimit = limit
      ? Math.min(500, Math.max(1, parseInt(limit, 10) || 100))
      : 100;
    return this.webhooksService.listEventsForProject(projectId, {
      limit: parsedLimit,
      ...(status ? { status } : {}),
    });
  }

  @Get('events/:eventId')
  async getEvent(
    @Param('id') projectId: string,
    @Param('eventId') eventId: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.workspaceAccess.assertProjectAction(
      projectId,
      user.id,
      ProjectActions.READ,
    );
    return this.webhooksService.findEventForProject(eventId, projectId);
  }

  @Post('events/:eventId/replay')
  async replayEvent(
    @Param('id') projectId: string,
    @Param('eventId') eventId: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.workspaceAccess.assertProjectAction(
      projectId,
      user.id,
      ProjectActions.UPDATE,
    );
    await this.webhooksService.findEventForProject(eventId, projectId);
    // Resets attempts and re-dispatches immediately (works for FAILED and DEAD_LETTER).
    return this.retryService.replayEvent(eventId);
  }

  @Patch('endpoints/:endpointId/enabled')
  async setEnabled(
    @Param('id') projectId: string,
    @Param('endpointId') endpointId: string,
    @Body() body: { enabled: boolean },
    @GetUser() user: JwtPayload,
  ) {
    await this.workspaceAccess.assertProjectAction(
      projectId,
      user.id,
      ProjectActions.UPDATE,
    );
    // Verify the endpoint belongs to this project (defense in depth)
    const endpoints =
      await this.webhooksService.listEndpointsForProject(projectId);
    if (!endpoints.find((e) => e.id === endpointId)) {
      throw new NotFoundException(
        `Endpoint ${endpointId} introuvable sur le projet ${projectId}`,
      );
    }
    return this.webhooksService.setEnabled(endpointId, body.enabled);
  }
}
