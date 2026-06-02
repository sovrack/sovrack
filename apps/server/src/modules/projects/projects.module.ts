import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { GitlabModule } from '../git-providers/gitlab/gitlab.module';
import { AppsModule } from './apps/apps.module';
import { EnvironmentsModule } from './environments/environments.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectImportService } from './services/project-import.service';
import { ProjectMembersService } from './services/project-members.service';

/**
 * Module Projects.
 */
@Module({
  imports: [PrismaModule, GitlabModule, AppsModule, EnvironmentsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectMembersService, ProjectImportService],
  exports: [ProjectsService, AppsModule],
})
export class ProjectsModule {}
