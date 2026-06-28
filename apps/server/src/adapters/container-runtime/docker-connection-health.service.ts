import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CircuitState } from '@prisma/client';
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
  | {
      kind: 'unreachable';
      serverId: string;
      endpoint: string;
      lastError: string;
    };

// CircuitState is the Prisma enum (single source of truth) — re-exported here
// for backward compatibility with existing importers of this module.
export { CircuitState };

export type HealthConnection = {
  serverId: string;
  endpoint: string;
  isReachable: boolean;
  consecutiveFailures: number;
  circuitState: string;
  circuitOpenedAt: Date | null;
};

/** Consecutive failures that trip the breaker (CLOSED → OPEN). */
export const FAILURES_BEFORE_OPEN = 3;
/** How long the breaker stays OPEN (silent) before a single HALF_OPEN probe. */
export const OPEN_COOLDOWN_MS = 10 * 60_000;

/**
 * Health monitor with a PERSISTED circuit breaker, so a flapping connection
 * produces at most ONE "down" notification (when it trips OPEN) and ONE "up"
 * notification (when it recovers) — instead of one alert per cron tick.
 */
@Injectable()
export class DockerConnectionHealthService {
  private readonly logger = new Logger(DockerConnectionHealthService.name);
  private enabled = true;

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
    this.logger.log(
      `docker-connection health: probing ${connections.length} connection(s)`,
    );
    for (const conn of connections) {
      try {
        await this.probeOne(conn);
      } catch (error) {
        this.logger.error(
          `Health probe crashed on ${conn.serverId}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
  }

  async probeOne(conn: HealthConnection): Promise<ProbeOutcome> {
    const state = (conn.circuitState as CircuitState) ?? 'CLOSED';

    if (state === 'OPEN') {
      const openedAt = conn.circuitOpenedAt
        ? new Date(conn.circuitOpenedAt).getTime()
        : 0;
      if (Date.now() - openedAt < OPEN_COOLDOWN_MS) {
        // Breaker open and still cooling down → absorb the failure silently.
        return { kind: 'skipped', reason: 'cooldown' };
      }
      // Cooldown elapsed → try a single probe in HALF_OPEN.
      await this.dockerConnections.persistCircuit(conn.serverId, {
        circuitState: 'HALF_OPEN',
      });
      return this.attempt(conn, 'HALF_OPEN');
    }

    return this.attempt(conn, state);
  }

  private async attempt(
    conn: HealthConnection,
    state: CircuitState,
  ): Promise<ProbeOutcome> {
    try {
      await this.dockerConnections.probeReachability(conn.serverId);

      if (state === 'HALF_OPEN') {
        // Recovery confirmed → close the breaker, notify once.
        await this.dockerConnections.persistCircuit(conn.serverId, {
          circuitState: 'CLOSED',
          consecutiveFailures: 0,
          circuitOpenedAt: null,
        });
        this.eventEmitter.emit(DOCKER_CONNECTION_RECOVERED, {
          serverId: conn.serverId,
          endpoint: conn.endpoint,
        } satisfies DockerConnectionRecoveredEvent);
        this.logger.log(
          `docker-connection ${conn.serverId} (${conn.endpoint}) recovered`,
        );
        return {
          kind: 'recovered',
          serverId: conn.serverId,
          endpoint: conn.endpoint,
        };
      }

      // CLOSED + success → clear any partial failure streak.
      if (conn.consecutiveFailures > 0) {
        await this.dockerConnections.persistCircuit(conn.serverId, {
          consecutiveFailures: 0,
        });
      }
      return { kind: 'skipped', reason: 'ok' };
    } catch (error) {
      const lastError = error instanceof Error ? error.message : 'unknown';
      const failures = (conn.consecutiveFailures ?? 0) + 1;

      if (state === 'HALF_OPEN') {
        // Still failing → reopen, restart the cooldown, stay silent.
        await this.dockerConnections.persistCircuit(conn.serverId, {
          circuitState: 'OPEN',
          circuitOpenedAt: new Date(),
          consecutiveFailures: failures,
        });
        this.logger.warn(
          `docker-connection ${conn.serverId} still down (half-open probe failed)`,
        );
        return { kind: 'skipped', reason: 'cooldown' };
      }

      if (failures >= FAILURES_BEFORE_OPEN) {
        // Trip the breaker and fire the single "down" notification.
        await this.dockerConnections.persistCircuit(conn.serverId, {
          circuitState: 'OPEN',
          circuitOpenedAt: new Date(),
          consecutiveFailures: failures,
        });
        this.eventEmitter.emit(DOCKER_CONNECTION_UNREACHABLE, {
          serverId: conn.serverId,
          endpoint: conn.endpoint,
          lastError,
          failedSince: new Date(),
        } satisfies DockerConnectionUnreachableEvent);
        this.logger.warn(
          `docker-connection ${conn.serverId} (${conn.endpoint}) unreachable after ${failures} checks: ${lastError}`,
        );
        return {
          kind: 'unreachable',
          serverId: conn.serverId,
          endpoint: conn.endpoint,
          lastError,
        };
      }

      // Below threshold → just record the failure, no alert.
      await this.dockerConnections.persistCircuit(conn.serverId, {
        consecutiveFailures: failures,
      });
      return { kind: 'skipped', reason: 'cooldown' };
    }
  }
}
