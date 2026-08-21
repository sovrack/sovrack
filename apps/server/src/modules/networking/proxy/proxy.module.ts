import { Module } from '@nestjs/common';
import { WorkspaceAuthorizationModule } from '../../iam/authorization/workspace-authorization.module';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

@Module({
  imports: [WorkspaceAuthorizationModule],
  controllers: [ProxyController],
  providers: [ProxyService],
  // exports: [ProxyService],
})
export class ProxyModule {}
