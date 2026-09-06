import { Global, Module } from '@nestjs/common';
import {
  bullQueueProvider,
  bullSetupQueueProvider,
  bullAutomationRunsQueueProvider,
} from './queue.provider';
import { QueueService } from './queue.service';
import { QueueMonitoringService } from './queue-monitoring.service';
import { QueueLifecycleService } from './queue-lifecycle.service';

// Loi d'architecture : core/ ne dépend JAMAIS d'un contexte métier.
// DeploymentsProcessor / AutomationProcessor (workers Bull) sont enregistrés
// dans leurs modules métier respectifs, pas ici — QueueModule reste générique.
@Global()
@Module({
  providers: [
    bullQueueProvider,
    bullSetupQueueProvider,
    bullAutomationRunsQueueProvider,
    QueueService,
    QueueMonitoringService,
    QueueLifecycleService,
  ],
  // Les tokens de queue doivent être exportés (pas seulement les services au-
  // dessus) : @Global() ne rend résolvables que les providers EXPORTÉS. Sans
  // ça, un @Inject('DEPLOYMENTS_QUEUE') d'un autre module résout undefined.
  exports: [
    QueueService,
    QueueMonitoringService,
    'DEPLOYMENTS_QUEUE',
    'SETUP_QUEUE',
    'AUTOMATION_RUNS_QUEUE',
  ],
})
export class QueueModule {}
