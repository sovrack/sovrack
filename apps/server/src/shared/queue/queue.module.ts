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
  exports: [QueueService, QueueMonitoringService],
})
export class QueueModule {}
