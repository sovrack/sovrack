import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { PlatformModule } from '../platform';
import { NotificationsModule } from '../notifications';
import { SourceProvidersModule } from '../source-providers';
import { WebhooksService } from './webhooks.service';
import { WebhookEventsService } from './webhook-events.service';
import { WebhookRetryService } from './services/webhook-retry.service';
import { IncomingWebhookController } from './incoming-webhook.controller';
import { WebhookAuditController } from './webhook-audit.controller';
import { WebhookManagementController } from './webhook-management.controller';
import { WebhookManagementService } from './webhook-management.service';

/**
 * Central, top-level webhook module — the single home for everything
 * webhook-related:
 *
 *   IncomingWebhookController    public unified entry  POST /webhooks/incoming/:token
 *   WebhookAuditController       admin/audit read APIs (endpoints + events)
 *   WebhookManagementController  configure/status/pause/resume per project
 *   WebhooksService              endpoint + event persistence (identity + audit)
 *   WebhookManagementService     provider-side registration lifecycle
 *
 * Provider-specific handlers (GitlabWebhookHandler, GithubWebhookHandler)
 * are registered centrally in SourceProvidersModule under the
 * WEBHOOK_HANDLER token and re-exported through SourceProvidersModule's
 * exports. Adding a provider requires no change to this module.
 */
@Module({
  imports: [
    PrismaModule,
    PlatformModule,
    NotificationsModule,
    SourceProvidersModule,
  ],
  controllers: [
    IncomingWebhookController,
    WebhookAuditController,
    WebhookManagementController,
  ],
  providers: [
    WebhooksService,
    WebhookEventsService,
    WebhookRetryService,
    WebhookManagementService,
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}
