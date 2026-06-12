import { Module } from '@nestjs/common';
import { ServersSharedModule } from './servers-shared.module';
import { AppJwtModule } from '../../../core/jwt/jwt.module';
import { NotificationsModule } from '../../notifications';
import { ServerManagementController } from './controllers/server-management.controller';
import { DockerConnectionController } from './controllers/docker-connection.controller';
import { ServerAuditController } from './controllers/server-audit.controller';
import { ServerValidationController } from './controllers/server-validation.controller';
import { ServerDetectionController } from './controllers/server-detection.controller';
import { DockerConnectionNotificationsListener } from './services/docker-connection-notifications.listener';

@Module({
  imports: [
    AppJwtModule,
    ServersSharedModule,
    NotificationsModule,
  ],
  controllers: [
    ServerManagementController,
    DockerConnectionController,
    ServerAuditController,
    ServerValidationController,
    ServerDetectionController,
  ],
  providers: [
    DockerConnectionNotificationsListener,
  ],
  exports: [ServersSharedModule],
})
export class ServersModule {}
