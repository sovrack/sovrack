import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/database/prisma.module';
import { ConfigsController } from './configs.controller';
import { ConfigsService } from './configs.service';
import { EnvConfigsController } from './env-configs.controller';
import { EnvConfigsService } from './env-configs.service';

@Module({
  imports: [PrismaModule],
  controllers: [ConfigsController, EnvConfigsController],
  providers: [ConfigsService, EnvConfigsService],
  exports: [ConfigsService, EnvConfigsService],
})
export class ConfigsModule {}
