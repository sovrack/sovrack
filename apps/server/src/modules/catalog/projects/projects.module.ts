import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { AuditModule } from '../../audit';
import { GitlabModule, SourceProvidersModule } from '../../source-providers';
import { PlatformModule } from '../../platform';
import { EnvironmentsModule } from '../environments/environments.module';
import { BillingModule } from '../../billing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectImportService } from './services/project-import.service';
import { ProjectAccessModule } from '../authorization/project-access.module';
import { ProjectMembersService } from './services/project-members.service';

/**
 * Module Projects — CRUD projets, environments, services, membres.
 * Webhook endpoint lifecycle now lives in the top-level WebhooksModule
 * (WebhookManagementService / WebhookManagementController).
 */
@Module({
  imports: [
    PrismaModule,
    GitlabModule,
    SourceProvidersModule,
    PlatformModule,
    EnvironmentsModule,
    AuditModule,
    ProjectAccessModule,
    BillingModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectMembersService, ProjectImportService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
