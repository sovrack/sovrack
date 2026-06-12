import { Global, Module } from '@nestjs/common';
import { bullQueueProvider } from './queue.provider';
import { QueueService } from './queue.service';

// Loi d'architecture : core/ ne dépend JAMAIS d'un contexte métier.
// DeploymentsProcessor (worker Bull) est enregistré dans DeploymentsModule,
// pas ici — QueueModule reste générique.
@Global()
@Module({
  providers: [bullQueueProvider, QueueService],
  exports: [QueueService],
})
export class QueueModule {}
