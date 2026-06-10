import { Module } from '@nestjs/common';
import { ServerManagementController } from '../controllers/server-management.controller';
import { DockerConnectionController } from '../controllers/docker-connection.controller';
import { DockerConnectionNotificationsListener } from '../services/docker-connection-notifications.listener';
import { NotificationsModule } from '../../notifications/notifications.module';
import { ServersSharedModule } from '../servers-shared.module';

// DockerConnectionsService, DockerConnectionHealthService, DockerApiService
// are all provided by the global DockerModule (registered in AppModule).
// This module only adds the notifications listener and exports the global
// Docker services for modules that import ServersModule.

@Module({
  imports: [ServersSharedModule, NotificationsModule],
  controllers: [ServerManagementController, DockerConnectionController],
  providers: [
    DockerConnectionNotificationsListener,
  ],
  exports: [],
})
export class ServerManagementModule {}
