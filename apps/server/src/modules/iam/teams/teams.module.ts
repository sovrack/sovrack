import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { BillingModule } from '../../billing';
import { NotificationsModule } from '../../notifications';
import { WorkspaceInvitationsController } from './workspace-invitations.controller';
import { WorkspaceInvitationsService } from './workspace-invitations.service';

@Module({
  imports: [BillingModule, NotificationsModule],
  controllers: [TeamsController, WorkspaceInvitationsController],
  providers: [TeamsService, WorkspaceInvitationsService],
  exports: [TeamsService, WorkspaceInvitationsService],
})
export class TeamsModule {}
