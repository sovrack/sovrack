import { Module } from '@nestjs/common';
import { VolumesController } from './volumes.controller';
import { VolumesService } from './volumes.service';
import { WorkspaceAuthorizationModule } from '../../iam/authorization/workspace-authorization.module';

@Module({
  imports: [WorkspaceAuthorizationModule],
  controllers: [VolumesController],
  providers: [VolumesService],
})
export class VolumesModule {}
