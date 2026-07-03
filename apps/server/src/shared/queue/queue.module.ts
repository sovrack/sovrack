import { Global, Module } from '@nestjs/common';
import { bullQueueProvider } from './queue.provider';
import { QueueService } from './queue.service';
import { QueueMonitoringService } from './queue-monitoring.service';
import { ScheduleModule } from '@nestjs/schedule';

// Loi d'architecture : core/ ne dépend JAMAIS d'un contexte métier.
// DeploymentsProcessor (worker Bull) est enregistré dans DeploymentsModule,
// pas ici — QueueModule reste générique.
@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [bullQueueProvider, QueueService, QueueMonitoringService],
  // 'DEPLOYMENTS_QUEUE' must be exported too, not just the services built on
  // top of it: @Global() only makes EXPORTED providers resolvable from other
  // modules. Without this, AppController's @Optional() @Inject('DEPLOYMENTS_QUEUE')
  // silently resolved to undefined and the /health Redis check always reported
  // "disconnected" regardless of Redis' real state (AUDIT_VERIFICATION_UI.md Point 1).
  exports: [QueueService, QueueMonitoringService, 'DEPLOYMENTS_QUEUE'],
})
export class QueueModule {}
