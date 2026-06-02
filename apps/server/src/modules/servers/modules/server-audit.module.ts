import { Module } from '@nestjs/common';
import { ServerAuditController } from '../controllers/server-audit.controller';
import { ServersSharedModule } from '../servers-shared.module';

@Module({
  imports: [ServersSharedModule],
  controllers: [ServerAuditController],
})
export class ServerAuditModule {}
