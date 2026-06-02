import { Module } from '@nestjs/common';
import { ServerPreparationController } from '../controllers/server-preparation.controller';
import { ServerPreparationOptionsController } from '../controllers/server-preparation-options.controller';
import { ServerPreparationsController } from '../controllers/server-preparations.controller';
import { ServersSharedModule } from '../servers-shared.module';

@Module({
  imports: [ServersSharedModule],
  controllers: [
    ServerPreparationController,
    ServerPreparationsController,
    ServerPreparationOptionsController,
  ],
})
export class ServerPreparationModule {}
