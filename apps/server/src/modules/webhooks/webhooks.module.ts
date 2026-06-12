import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { PlatformModule } from '../platform';
import { GitlabModule, GithubModule, SourceProvidersModule } from '../source-providers';
import { GitlabWebhookHandler } from '../source-providers/adapters/gitlab/gitlab-webhook.handler';
import { GithubWebhookHandler } from '../source-providers/adapters/github/github-webhook.handler';
import { WebhooksService } from './webhooks.service';
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
 * Provider reception logic stays in each source provider module
 * (GitlabWebhookHandler, GithubWebhookHandler) and is plugged in here via
 * the WEBHOOK_HANDLER registry. Adding a provider = add one line to the
 * factory below — no new route, no new controller.
 */
@Module({
  imports: [
    PrismaModule,
    PlatformModule,
    GitlabModule,
    GithubModule,
    SourceProvidersModule,
  ],
  controllers: [
    IncomingWebhookController,
    WebhookAuditController,
    WebhookManagementController,
  ],
  providers: [
    WebhooksService,
    WebhookManagementService,
    {
      provide: WEBHOOK_HANDLER,
      useFactory: (
        gitlab: GitlabWebhookHandler,
        github: GithubWebhookHandler,
      ): IWebhookHandler[] => [gitlab, github],
      inject: [GitlabWebhookHandler, GithubWebhookHandler],
    },
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}
