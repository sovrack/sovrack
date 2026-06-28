import { Module } from '@nestjs/common';
import { ServersSharedModule } from './servers-shared.module';
import { AppJwtModule } from '../../../shared/jwt/jwt.module';
import { ServerManagementController } from './controllers/server-management.controller';
import { DockerConnectionController } from './controllers/docker-connection.controller';
import { ServerAuditController } from './controllers/server-audit.controller';
import { ServerValidationController } from './controllers/server-validation.controller';
import { ServerDetectionController } from './controllers/server-detection.controller';

@Module({
  imports: [AppJwtModule, ServersSharedModule],
  controllers: [
    ServerManagementController,
    DockerConnectionController,
    ServerAuditController,
    ServerValidationController,
    ServerDetectionController,
  ],
  providers: [],
  exports: [ServersSharedModule],
})
export class ServersModule {}
