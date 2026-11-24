import { Module } from '@nestjs/common';
import { ServersSharedModule } from './servers-shared.module';
import { AppJwtModule } from '../../../shared/jwt/jwt.module';
import { ServerManagementController } from './controllers/server-management.controller';
import { DockerConnectionController } from './controllers/docker-connection.controller';
import { ServerAuditController } from './controllers/server-audit.controller';
import { ServerValidationController } from './controllers/server-validation.controller';
import { ServerDetectionController } from './controllers/server-detection.controller';
import { ManagedServersController } from './controllers/managed-servers.controller';
import { AgentTunnelService } from './agent-tunnel.service';
import { AgentTunnelGateway } from './agent-tunnel.gateway';

@Module({
  imports: [AppJwtModule, ServersSharedModule],
  controllers: [
    ServerManagementController,
    DockerConnectionController,
    ServerAuditController,
    ServerValidationController,
    ServerDetectionController,
    ManagedServersController,
  ],
  providers: [AgentTunnelService, AgentTunnelGateway],
  exports: [ServersSharedModule, AgentTunnelService],
})
export class ServersModule {}
