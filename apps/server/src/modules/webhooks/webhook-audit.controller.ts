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
import { Role, WebhookEventStatus } from '@prisma/client';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
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
@Controller('projects/:id/webhooks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WebhookAuditController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly retryService: WebhookRetryService,
  ) {}

  @Get('endpoints')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async listEndpoints(@Param('id') projectId: string) {
    return this.webhooksService.listEndpointsForProject(projectId);
  }

  @Get('events')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async listEvents(
    @Param('id') projectId: string,
    @Query('status') status?: WebhookEventStatus,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit
      ? Math.min(500, Math.max(1, parseInt(limit, 10) || 100))
      : 100;
    return this.webhooksService.listEventsForProject(projectId, {
      limit: parsedLimit,
      ...(status ? { status } : {}),
    });
  }

  @Get('events/:eventId')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async getEvent(@Param('eventId') eventId: string) {
    return this.webhooksService.findEvent(eventId);
  }

  @Post('events/:eventId/replay')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async replayEvent(@Param('eventId') eventId: string) {
    // Resets attempts and re-dispatches immediately (works for FAILED and DEAD_LETTER).
    return this.retryService.replayEvent(eventId);
  }

  @Patch('endpoints/:endpointId/enabled')
  @Roles(Role.ADMIN)
  async setEnabled(
    @Param('id') projectId: string,
    @Param('endpointId') endpointId: string,
    @Body() body: { enabled: boolean },
  ) {
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
