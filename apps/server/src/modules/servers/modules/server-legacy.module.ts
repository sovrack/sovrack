import { Module } from '@nestjs/common';
import { ServerLegacyController } from '../controllers/server-legacy.controller';
import { ServersSharedModule } from '../servers-shared.module';

@Module({
  imports: [ServersSharedModule],
  controllers: [ServerLegacyController],
})
export class ServerLegacyModule {}
