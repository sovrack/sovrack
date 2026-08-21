import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { WorkspaceAuthorizationModule } from '../../iam/authorization/workspace-authorization.module';

@Module({
  imports: [PrismaModule, WorkspaceAuthorizationModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
