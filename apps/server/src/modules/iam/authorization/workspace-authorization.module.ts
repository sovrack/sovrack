import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../../shared/database/prisma.module';
import { WorkspaceAccessService } from './workspace-access.service';
import { ServerWorkspaceGuard } from './server-workspace.guard';
import { WorkspaceGuard } from './workspace.guard';
import { ProjectWorkspaceGuard } from './project-workspace.guard';
import { AccountDeletionService } from './account-deletion.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    WorkspaceAccessService,
    ProjectWorkspaceGuard,
    ServerWorkspaceGuard,
    WorkspaceGuard,
    AccountDeletionService,
  ],
  exports: [
    WorkspaceAccessService,
    ProjectWorkspaceGuard,
    ServerWorkspaceGuard,
    WorkspaceGuard,
    AccountDeletionService,
  ],
})
export class WorkspaceAuthorizationModule {}
