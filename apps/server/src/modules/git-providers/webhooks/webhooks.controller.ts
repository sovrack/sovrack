import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role, WebhookEventStatus } from '@prisma/client';
import { Roles } from '../../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../core/guards/roles.guard';
import { WebhooksService } from './webhooks.service';

/**
 * Read-only API for the Webhook observability layer (P4 of the
 * refactoring plan). The write path (recording events) is invoked
 * internally by the existing GitLab/GitHub webhook controllers; this
 * controller is only for the admin / audit UI.
 */
@Controller('projects/:id/webhooks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

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
    const parsedLimit = limit ? Math.min(500, Math.max(1, parseInt(limit, 10) || 100)) : 100;
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

  @Patch('endpoints/:endpointId/enabled')
  @Roles(Role.ADMIN)
  async setEnabled(
    @Param('id') _projectId: string,
    @Param('endpointId') endpointId: string,
    @Body() body: { enabled: boolean },
  ) {
    // Verify the endpoint belongs to this project (defense in depth)
    const endpoint = await this.webhooksService.listEndpointsForProject(
      _projectId,
    );
    if (!endpoint.find((e) => e.id === endpointId)) {
      throw new NotFoundException(
        `Endpoint ${endpointId} introuvable sur le projet ${_projectId}`,
      );
    }
    return this.webhooksService.setEnabled(endpointId, body.enabled);
  }
}
