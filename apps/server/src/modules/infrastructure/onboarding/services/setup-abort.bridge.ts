import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RedisAbortChannel } from '../../../../shared/queue/redis-abort-channel';
import { runsBackgroundWork } from '../../../../shared/utils/process-role.util';
import { InfraSetupRunnerService } from './infra-setup-runner.service';

/**
 * Cross-process cancellation for server setups: the API publishes the setupId,
 * the worker (where the run and its AbortController live) aborts locally,
 * killing the ansible-playbook subprocess immediately. See RedisAbortChannel.
 */
@Injectable()
export class SetupAbortBridge implements OnModuleInit, OnModuleDestroy {
  private readonly channel: RedisAbortChannel;

  constructor(private readonly runner: InfraSetupRunnerService) {
    this.channel = new RedisAbortChannel(
      'setup:abort',
      runsBackgroundWork(),
      (id) => this.runner.abort(id),
    );
  }

  onModuleInit(): void {
    this.channel.init();
  }

  async requestAbort(setupId: string): Promise<void> {
    await this.channel.requestAbort(setupId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel.close();
  }
}
