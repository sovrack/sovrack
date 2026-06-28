import { Module } from '@nestjs/common';
import { ServerRunsService } from './server-runs.service';

/**
 * Leaf module exposing the shared ServerRun persistence layer. Imported by both
 * the preparation engine (InfrastructureModule) and the automation engine
 * (AutomationModule). PrismaModule is @Global, so no extra imports are needed.
 */
@Module({
  providers: [ServerRunsService],
  exports: [ServerRunsService],
})
export class ServerRunsModule {}
