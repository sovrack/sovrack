import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DockerConnectionHealthService,
  DOCKER_CONNECTION_RECOVERED,
  DOCKER_CONNECTION_UNREACHABLE,
} from './docker-connection-health.service';
import { DockerConnectionsService } from './docker-connections.service';

/**
 * Docker connection health monitor. Tests focus on the transition logic
 * (reachable → unreachable, unreachable → recovered) and the throttle
 * (no spam from transient glitches).
 */
describe('DockerConnectionHealthService', () => {
  let service: DockerConnectionHealthService;
  let dockerConnections: {
    listForHealthCheck: jest.Mock;
    probeReachability: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  const realDateNow = Date.now;

  beforeEach(async () => {
    dockerConnections = {
      listForHealthCheck: jest.fn(),
      probeReachability: jest.fn(),
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

  afterEach(() => {
    Date.now = realDateNow;
  });

  describe('runHealthCheck', () => {
    it('skips entirely when no connections are configured', async () => {
      dockerConnections.listForHealthCheck.mockResolvedValue([]);
      await service.runHealthCheck();
      expect(dockerConnections.probeReachability).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('processes every connection in the list (serial)', async () => {
      dockerConnections.listForHealthCheck.mockResolvedValue([
        { id: 'c1', serverId: 'srv_1', endpoint: 'tcp://10.0.0.1:2376', isReachable: true },
        { id: 'c2', serverId: 'srv_2', endpoint: 'tcp://10.0.0.2:2376', isReachable: true },
      ]);
      dockerConnections.probeReachability.mockResolvedValue({});
      await service.runHealthCheck();
      expect(dockerConnections.probeReachability).toHaveBeenCalledTimes(2);
    });

    it('does not run when disabled (deploys in progress)', async () => {
      dockerConnections.listForHealthCheck.mockResolvedValue([
        { id: 'c1', serverId: 'srv_1', endpoint: 'tcp://x', isReachable: true },
      ]);
      service.setEnabled(false);
      await service.runHealthCheck();
      expect(dockerConnections.probeReachability).not.toHaveBeenCalled();
    });
  });

  describe('probeOne — transition detection', () => {
    beforeEach(() => {
      service._resetStateForTests();
    });

    it('does not emit on a successful probe of a healthy connection', async () => {
      dockerConnections.probeReachability.mockResolvedValue({});
      const outcome = await service.probeOne('srv_1', 'tcp://x', true);
      expect(outcome).toEqual({ kind: 'skipped', reason: 'ok' });
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('emits "recovered" when an unreachable connection becomes reachable', async () => {
      dockerConnections.probeReachability.mockResolvedValue({});
      const outcome = await service.probeOne('srv_1', 'tcp://x', false);
      expect(outcome).toEqual({
        kind: 'recovered',
        serverId: 'srv_1',
        endpoint: 'tcp://x',
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DOCKER_CONNECTION_RECOVERED,
        expect.objectContaining({ serverId: 'srv_1', endpoint: 'tcp://x' }),
      );
    });

    it('does NOT emit on the first failure (avoids transient-glitch alerts)', async () => {
      dockerConnections.probeReachability.mockRejectedValue(
        new Error('TLS handshake timeout'),
      );
      const outcome = await service.probeOne('srv_1', 'tcp://x', true);
      expect(outcome).toEqual({ kind: 'skipped', reason: 'cooldown' });
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('emits "unreachable" only after 2 consecutive failures', async () => {
      dockerConnections.probeReachability.mockRejectedValue(
        new Error('ECONNRESET'),
      );
      // Failure 1 — silent
      await service.probeOne('srv_1', 'tcp://x', true);
      // Force clock forward past throttle window
      Date.now = () => realDateNow() + 120_000;
      // Failure 2 — alert
      const outcome = await service.probeOne('srv_1', 'tcp://x', true);
      expect(outcome).toEqual({
        kind: 'unreachable',
        serverId: 'srv_1',
        endpoint: 'tcp://x',
        lastError: 'ECONNRESET',
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        DOCKER_CONNECTION_UNREACHABLE,
        expect.objectContaining({
          serverId: 'srv_1',
          endpoint: 'tcp://x',
          lastError: 'ECONNRESET',
        }),
      );
    });

    it('throttles to one probe per minute per server', async () => {
      dockerConnections.probeReachability.mockResolvedValue({});
      await service.probeOne('srv_1', 'tcp://x', true);
      // Second call within the same minute — must skip
      const outcome = await service.probeOne('srv_1', 'tcp://x', true);
      expect(outcome).toEqual({ kind: 'skipped', reason: 'ok' });
      expect(dockerConnections.probeReachability).toHaveBeenCalledTimes(1);
    });

    it('resets the failure counter on a successful probe', async () => {
      dockerConnections.probeReachability
        .mockRejectedValueOnce(new Error('first-fail'))
        .mockResolvedValueOnce({});
      await service.probeOne('srv_1', 'tcp://x', true);
      Date.now = () => realDateNow() + 120_000;
      await service.probeOne('srv_1', 'tcp://x', true);
      // After the recovery, a new failure must again wait for the
      // 2-failure threshold before alerting.
      Date.now = () => realDateNow() + 240_000;
      dockerConnections.probeReachability.mockRejectedValue(
        new Error('second-fail'),
      );
      const outcome = await service.probeOne('srv_1', 'tcp://x', true);
      expect(outcome).toEqual({ kind: 'skipped', reason: 'cooldown' });
    });
  });
});
