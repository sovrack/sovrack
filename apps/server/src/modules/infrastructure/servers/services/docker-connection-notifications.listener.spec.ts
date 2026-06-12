import { Test } from '@nestjs/testing';
import { DockerConnectionNotificationsListener } from './docker-connection-notifications.listener';
import { NotificationsService } from '../../../notifications/notifications.service';
import { PrismaService } from '../../../../core/database/prisma.service';
import {
  DOCKER_CONNECTION_RECOVERED,
  DOCKER_CONNECTION_UNREACHABLE,
} from '../../../../core/container-runtime/docker-connection-health.service';

/**
 * P5 wire-up — listener that bridges the in-process EventEmitter2
 * events to the Slack/email channels exposed by NotificationsService.
 */
describe('DockerConnectionNotificationsListener', () => {
  let listener: DockerConnectionNotificationsListener;
  let notifications: {
    notifyDockerConnectionDown: jest.Mock;
    notifyDockerConnectionRecovered: jest.Mock;
  };
  let prisma: { server: { findUnique: jest.Mock } };

  beforeEach(async () => {
    notifications = {
      notifyDockerConnectionDown: jest.fn().mockResolvedValue(undefined),
      notifyDockerConnectionRecovered: jest.fn().mockResolvedValue(undefined),
    };
    prisma = { server: { findUnique: jest.fn() } };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DockerConnectionNotificationsListener,
        { provide: NotificationsService, useValue: notifications },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    listener = moduleRef.get(DockerConnectionNotificationsListener);
  });

  it('forwards DOCKER_CONNECTION_UNREACHABLE to notifyDockerConnectionDown with server name', async () => {
    prisma.server.findUnique.mockResolvedValue({ name: 'prod-platform-01' });
    await listener.onUnreachable({
      serverId: 'srv_1',
      endpoint: 'tcp://10.0.0.1:2376',
      lastError: 'TLS handshake timeout',
      failedSince: new Date('2026-06-04T15:00:00Z'),
    });
    expect(notifications.notifyDockerConnectionDown).toHaveBeenCalledWith({
      serverId: 'srv_1',
      serverName: 'prod-platform-01',
      endpoint: 'tcp://10.0.0.1:2376',
      lastError: 'TLS handshake timeout',
      failedSince: new Date('2026-06-04T15:00:00Z'),
    });
  });

  it('forwards DOCKER_CONNECTION_RECOVERED to notifyDockerConnectionRecovered', async () => {
    prisma.server.findUnique.mockResolvedValue({ name: 'prod-platform-01' });
    await listener.onRecovered({
      serverId: 'srv_1',
      endpoint: 'tcp://10.0.0.1:2376',
    });
    expect(notifications.notifyDockerConnectionRecovered).toHaveBeenCalledWith({
      serverId: 'srv_1',
      serverName: 'prod-platform-01',
      endpoint: 'tcp://10.0.0.1:2376',
    });
  });

  it('silently passes when the server row was deleted (cascading delete)', async () => {
    prisma.server.findUnique.mockResolvedValue(null);
    await listener.onUnreachable({
      serverId: 'orphan',
      endpoint: 'tcp://x',
      lastError: 'whatever',
      failedSince: new Date(),
    });
    expect(notifications.notifyDockerConnectionDown).toHaveBeenCalledWith({
      serverId: 'orphan',
      endpoint: 'tcp://x',
      lastError: 'whatever',
      failedSince: expect.any(Date),
    });
  });

  it('never throws — swallows notification errors so the cron loop is not poisoned', async () => {
    prisma.server.findUnique.mockResolvedValue({ name: 'srv' });
    notifications.notifyDockerConnectionDown.mockRejectedValue(
      new Error('Slack rate-limited'),
    );
    await expect(
      listener.onUnreachable({
        serverId: 'srv_1',
        endpoint: 'tcp://x',
        lastError: 'whatever',
        failedSince: new Date(),
      }),
    ).resolves.toBeUndefined();
  });

  it('uses the right event constants (catches accidental rename)', () => {
    expect(DOCKER_CONNECTION_UNREACHABLE).toBe('docker-connection.unreachable');
    expect(DOCKER_CONNECTION_RECOVERED).toBe('docker-connection.recovered');
  });
});
