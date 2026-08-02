import { Module } from '@nestjs/common';
import { ProjectTeamsController } from './project-teams.controller';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { BillingModule } from '../../billing';

@Module({
  imports: [BillingModule],
  controllers: [TeamsController, ProjectTeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
