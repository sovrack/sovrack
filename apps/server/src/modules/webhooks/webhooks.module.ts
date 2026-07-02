import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { PlatformModule } from '../platform';
import { NotificationsModule } from '../notifications';
import { SourceProvidersModule } from '../source-providers';
import { GitlabWebhookHandler } from './adapters/gitlab/gitlab-webhook.handler';
import { GithubWebhookHandler } from './adapters/github/github-webhook.handler';
import { WebhooksService } from './webhooks.service';
import { WebhookEventsService } from './webhook-events.service';
import { WebhookRetryService } from './services/webhook-retry.service';
import { IncomingWebhookController } from './incoming-webhook.controller';
import { WebhookAuditController } from './webhook-audit.controller';
import { WebhookManagementController } from './webhook-management.controller';
import { WebhookManagementService } from './webhook-management.service';
import {
  IWebhookHandler,
  WEBHOOK_HANDLER,
} from './interfaces/webhook-handler.interface';

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
 * Provider reception logic now lives locally in adapters/ (GitlabWebhookHandler,
 * GithubWebhookHandler) and is plugged in here via the WEBHOOK_HANDLER
 * registry. Adding a provider = add one line to the factory below — no new
 * route, no new controller. Only SourceProvidersModule is imported (for
 * WebhookManagementService, which registers webhooks on the provider side
 * through the IGitProvider abstraction) — the outbound *-webhook-configurator
 * services stay in source-providers/ to avoid a circular module dependency.
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
    GitlabWebhookHandler,
    GithubWebhookHandler,
    {
      provide: WEBHOOK_HANDLER,
      useFactory: (
        gitlab: GitlabWebhookHandler,
        github: GithubWebhookHandler,
      ): IWebhookHandler[] => [gitlab, github],
      inject: [GitlabWebhookHandler, GithubWebhookHandler],
    },
  ],
  // WebhookManagementService exported for BuildModule (legacy
  // reconcile-webhooks endpoint notice, see webhook-management.service.ts).
  exports: [WebhooksService, WebhookManagementService],
})
export class WebhooksModule {}
