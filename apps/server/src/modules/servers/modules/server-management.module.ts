import { Module } from '@nestjs/common';
import { ServerManagementController } from '../controllers/server-management.controller';
import { ServersSharedModule } from '../servers-shared.module';

@Module({
  imports: [ServersSharedModule],
  controllers: [ServerManagementController],
})
export class ServerManagementModule {}
