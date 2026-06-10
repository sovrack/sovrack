import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { GitlabModule } from '../git-providers/gitlab/gitlab.module';
import { GitProvidersModule } from '../git-providers/git-providers.module';
import { PlatformModule } from '../platform/platform.module';
import { ProjectServicesModule } from '../project-services/project-services.module';
import { EnvironmentsModule } from '../environments/environments.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectImportService } from './services/project-import.service';
import { ProjectMembersService } from './services/project-members.service';
import { ProjectWebhookService } from './webhooks/project-webhook.service';
import { ProjectWebhookController } from './webhooks/project-webhook.controller';

/**
 * Module Projects — CRUD projets, environments, services, membres.
 * Webhook endpoint lifecycle (create/configure/pause) via ProjectWebhookService.
 */
@Module({
  imports: [PrismaModule, GitlabModule, GitProvidersModule, PlatformModule, ProjectServicesModule, EnvironmentsModule, AuditModule],
  controllers: [ProjectsController, ProjectWebhookController],
  providers: [ProjectsService, ProjectMembersService, ProjectImportService, ProjectWebhookService],
  exports: [ProjectsService, ProjectServicesModule, ProjectWebhookService],
})
export class ProjectsModule {}
