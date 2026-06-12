import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DockerConnectionsService } from './docker-connections.service';

export const DOCKER_CONNECTION_UNREACHABLE = 'docker-connection.unreachable';
export const DOCKER_CONNECTION_RECOVERED = 'docker-connection.recovered';

export type DockerConnectionUnreachableEvent = {
  serverId: string;
  endpoint: string;
  lastError: string;
  failedSince: Date;
};

export type DockerConnectionRecoveredEvent = {
  serverId: string;
  endpoint: string;
};

export type ProbeOutcome =
  | { kind: 'skipped'; reason: 'ok' | 'cooldown' }
  | { kind: 'recovered'; serverId: string; endpoint: string }
  | { kind: 'unreachable'; serverId: string; endpoint: string; lastError: string };

const MIN_RETRY_INTERVAL_MS = 60_000;
const MAX_CONSECUTIVE_FAILURES_BEFORE_ALERT = 2;

@Injectable()
export class DockerConnectionHealthService {
  private readonly logger = new Logger(DockerConnectionHealthService.name);
  private enabled = true;
  private readonly lastProbeAt = new Map<string, number>();
  private readonly consecutiveFailures = new Map<string, number>();

  constructor(
    private readonly dockerConnections: DockerConnectionsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'docker-connection-health' })
  async runHealthCheck(): Promise<void> {
    if (!this.enabled) return;
    const connections = await this.dockerConnections.listForHealthCheck();
    if (connections.length === 0) return;
    this.logger.log(`docker-connection health: probing ${connections.length} connection(s)`);
    for (const conn of connections) {
      try {
        await this.probeOne(conn.serverId, conn.endpoint, conn.isReachable);
      } catch (error) {
        this.logger.error(`Health probe crashed on ${conn.serverId}: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }
  }

  async probeOne(
    serverId: string,
    endpoint: string,
    wasReachable: boolean,
  ): Promise<ProbeOutcome> {
    const now = Date.now();
    const last = this.lastProbeAt.get(serverId);
    if (last && now - last < MIN_RETRY_INTERVAL_MS) {
      return { kind: 'skipped', reason: 'ok' };
    }
    this.lastProbeAt.set(serverId, now);

    try {
      await this.dockerConnections.probeReachability(serverId);
      this.consecutiveFailures.set(serverId, 0);
      if (!wasReachable) {
        this.eventEmitter.emit(DOCKER_CONNECTION_RECOVERED, { serverId, endpoint } satisfies DockerConnectionRecoveredEvent);
        this.logger.log(`docker-connection ${serverId} (${endpoint}) recovered`);
        return { kind: 'recovered', serverId, endpoint };
      }
      return { kind: 'skipped', reason: 'ok' };
    } catch (error) {
      const lastError = error instanceof Error ? error.message : 'unknown';
      const failures = (this.consecutiveFailures.get(serverId) ?? 0) + 1;
      this.consecutiveFailures.set(serverId, failures);

      if (failures >= MAX_CONSECUTIVE_FAILURES_BEFORE_ALERT && wasReachable) {
        this.eventEmitter.emit(DOCKER_CONNECTION_UNREACHABLE, {
          serverId,
          endpoint,
          lastError,
          failedSince: new Date(),
        } satisfies DockerConnectionUnreachableEvent);
        this.logger.warn(`docker-connection ${serverId} (${endpoint}) unreachable: ${lastError}`);
        return { kind: 'unreachable', serverId, endpoint, lastError };
      }
      return { kind: 'skipped', reason: 'cooldown' };
    }
  }

  _resetStateForTests(): void {
    this.lastProbeAt.clear();
    this.consecutiveFailures.clear();
  }
}
