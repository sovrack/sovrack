import { Module } from '@nestjs/common';
import { ServerDetectionController } from '../controllers/server-detection.controller';
import { ServersSharedModule } from '../servers-shared.module';

@Module({
  imports: [ServersSharedModule],
  controllers: [ServerDetectionController],
})
export class ServerDetectionModule {}
