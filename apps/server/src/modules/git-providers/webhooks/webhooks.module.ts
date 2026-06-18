import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/database/prisma.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { IncomingWebhookController } from './incoming-webhook.controller';
import { GitlabModule } from '../gitlab/gitlab.module';
import { GithubModule } from '../github/github.module';

/**
 * Webhook dispatch module — receives and routes all incoming provider events.
 *
 *   WebhooksController          (admin/audit read APIs, JWT-guarded)
 *   IncomingWebhookController   (public unified endpoint POST /webhooks/incoming/:token)
 *   WebhooksService             (WebhookEndpoint find-by-token + WebhookEvent audit)
 *
 * Add new provider modules here as cases are added to IncomingWebhookController.dispatch().
 */
@Module({
  imports: [PrismaModule, GitlabModule, GithubModule],
  controllers: [WebhooksController, IncomingWebhookController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
