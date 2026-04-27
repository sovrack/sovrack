import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GitlabModule } from '../gitlab/gitlab.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

/**
 * Module Projects.
 */
@Module({
  imports: [PrismaModule, GitlabModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
