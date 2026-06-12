import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/database/prisma.module';
import { AuditModule } from '../../audit';
import { GitlabModule } from '../../source-providers/gitlab/gitlab.module';
import { SourceProvidersModule } from '../../source-providers';
import { PlatformModule } from '../../platform';
import { EnvironmentsModule } from '../environments/environments.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectImportService } from './services/project-import.service';
import { ProjectMembersService } from './services/project-members.service';

/**
 * Module Projects — CRUD projets, environments, services, membres.
 * Webhook endpoint lifecycle now lives in the top-level WebhooksModule
 * (WebhookManagementService / WebhookManagementController).
 */
@Module({
  imports: [PrismaModule, GitlabModule, SourceProvidersModule, PlatformModule, EnvironmentsModule, AuditModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectMembersService, ProjectImportService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
