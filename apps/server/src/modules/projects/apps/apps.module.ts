import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/database/prisma.module';
import { GitlabModule } from '../../git-providers/gitlab/gitlab.module';
import { AppsController } from './apps.controller';
import { AppsService } from './apps.service';

@Module({
  imports: [PrismaModule, GitlabModule],
  controllers: [AppsController],
  providers: [AppsService],
  exports: [AppsService],
})
export class AppsModule {}
