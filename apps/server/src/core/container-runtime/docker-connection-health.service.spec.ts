import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DockerConnectionHealthService,
  DOCKER_CONNECTION_RECOVERED,
  DOCKER_CONNECTION_UNREACHABLE,
  HealthConnection,
  OPEN_COOLDOWN_MS,
} from './docker-connection-health.service';
import { DockerConnectionsService } from './docker-connections.service';

/**
 * Persisted circuit breaker: at most one "down" alert (CLOSED→OPEN) and one
 * "up" alert (HALF_OPEN→CLOSED), no matter how long a connection flaps.
 */
describe('DockerConnectionHealthService (circuit breaker)', () => {
  let service: DockerConnectionHealthService;
  let dockerConnections: {
    listForHealthCheck: jest.Mock;
    probeReachability: jest.Mock;
    persistCircuit: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };

  const base: HealthConnection = {
    serverId: 'srv_1',
    endpoint: 'tcp://x',
    isReachable: true,
    consecutiveFailures: 0,
    circuitState: 'CLOSED',
    circuitOpenedAt: null,
  };
  const conn = (o: Partial<HealthConnection> = {}): HealthConnection => ({ ...base, ...o });

  beforeEach(async () => {
    dockerConnections = {
      listForHealthCheck: jest.fn(),
      probeReachability: jest.fn(),
      persistCircuit: jest.fn().mockResolvedValue(undefined),
    };
    eventEmitter = { emit: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DockerConnectionHealthService,
        { provide: DockerConnectionsService, useValue: dockerConnections },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();
    service = moduleRef.get(DockerConnectionHealthService);
  });

  describe('runHealthCheck', () => {
    it('skips entirely when no connections are configured', async () => {
      dockerConnections.listForHealthCheck.mockResolvedValue([]);
      await service.runHealthCheck();
      expect(dockerConnections.probeReachability).not.toHaveBeenCalled();
    });

    it('does not run when disabled', async () => {
      dockerConnections.listForHealthCheck.mockResolvedValue([conn()]);
      service.setEnabled(false);
      await service.runHealthCheck();
      expect(dockerConnections.probeReachability).not.toHaveBeenCalled();
    });
  });

  describe('CLOSED state', () => {
    it('healthy probe → no alert, no state change', async () => {
      dockerConnections.probeReachability.mockResolvedValue({});
      const out = await service.probeOne(conn());
      expect(out).toEqual({ kind: 'skipped', reason: 'ok' });
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('first/second failure → silent, only records the streak', async () => {
      dockerConnections.probeReachability.mockRejectedValue(new Error('ECONNRESET'));
      const out = await service.probeOne(conn({ consecutiveFailures: 1 }));
      expect(out).toEqual({ kind: 'skipped', reason: 'cooldown' });
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(dockerConnections.persistCircuit).toHaveBeenCalledWith('srv_1', {
        consecutiveFailures: 2,
      });
    });

    it('3rd consecutive failure → OPEN + a single unreachable alert', async () => {
      dockerConnections.probeReachability.mockRejectedValue(new Error('ECONNRESET'));
      const out = await service.probeOne(conn({ consecutiveFailures: 2 }));
      expect(out).toMatchObject({ kind: 'unreachable', serverId: 'srv_1' });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DOCKER_CONNECTION_UNREACHABLE,
        expect.objectContaining({ serverId: 'srv_1', lastError: 'ECONNRESET' }),
      );
      expect(dockerConnections.persistCircuit).toHaveBeenCalledWith(
        'srv_1',
        expect.objectContaining({ circuitState: 'OPEN', consecutiveFailures: 3 }),
      );
    });

    it('recovery streak reset on success when failures were pending', async () => {
      dockerConnections.probeReachability.mockResolvedValue({});
      await service.probeOne(conn({ consecutiveFailures: 2 }));
      expect(dockerConnections.persistCircuit).toHaveBeenCalledWith('srv_1', {
        consecutiveFailures: 0,
      });
    });
  });

  describe('OPEN state', () => {
    it('within cooldown → absorbed silently, no probe', async () => {
      const out = await service.probeOne(
        conn({ circuitState: 'OPEN', circuitOpenedAt: new Date(), consecutiveFailures: 3 }),
      );
      expect(out).toEqual({ kind: 'skipped', reason: 'cooldown' });
      expect(dockerConnections.probeReachability).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('after cooldown → HALF_OPEN probe; success closes the breaker + recovery alert', async () => {
      dockerConnections.probeReachability.mockResolvedValue({});
      const out = await service.probeOne(
        conn({
          circuitState: 'OPEN',
          circuitOpenedAt: new Date(Date.now() - OPEN_COOLDOWN_MS - 1000),
          consecutiveFailures: 3,
        }),
      );
      expect(out).toMatchObject({ kind: 'recovered', serverId: 'srv_1' });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DOCKER_CONNECTION_RECOVERED,
        expect.objectContaining({ serverId: 'srv_1' }),
      );
      expect(dockerConnections.persistCircuit).toHaveBeenCalledWith(
        'srv_1',
        expect.objectContaining({ circuitState: 'CLOSED', consecutiveFailures: 0 }),
      );
    });

    it('after cooldown → HALF_OPEN probe; failure reopens silently (no second alert)', async () => {
      dockerConnections.probeReachability.mockRejectedValue(new Error('still down'));
      const out = await service.probeOne(
        conn({
          circuitState: 'OPEN',
          circuitOpenedAt: new Date(Date.now() - OPEN_COOLDOWN_MS - 1000),
          consecutiveFailures: 3,
        }),
      );
      expect(out).toEqual({ kind: 'skipped', reason: 'cooldown' });
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(dockerConnections.persistCircuit).toHaveBeenCalledWith(
        'srv_1',
        expect.objectContaining({ circuitState: 'OPEN' }),
      );
    });
  });
});
