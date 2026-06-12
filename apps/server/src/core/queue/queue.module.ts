import { Global, Module } from '@nestjs/common';
import { bullQueueProvider } from './queue.provider';
import { QueueService } from './queue.service';
import { DeploymentsProcessor } from '../../modules/deployments/processors/deployments.processor';

@Global()
@Module({
  providers: [bullQueueProvider, QueueService, DeploymentsProcessor],
  exports: [QueueService],
})
export class QueueModule {}
