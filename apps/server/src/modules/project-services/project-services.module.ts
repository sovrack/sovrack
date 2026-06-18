import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { GitlabModule } from '../git-providers/gitlab/gitlab.module';
import { ProjectServicesController } from './project-services.controller';
import { ProjectServicesService } from './project-services.service';

@Module({
  imports: [PrismaModule, GitlabModule],
  controllers: [ProjectServicesController],
  providers: [ProjectServicesService],
  exports: [ProjectServicesService],
})
export class ProjectServicesModule {}
