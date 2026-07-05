import { DockerConnectionNotificationsListener } from './docker-connection.listener';

function makeSvc(
  opts: {
    serverName?: string | null;
    serverLookupError?: boolean;
    notifyError?: boolean;
  } = {},
) {
  const prisma = {
    server: {
      findUnique: opts.serverLookupError
        ? jest.fn().mockRejectedValue(new Error('db error'))
        : jest
            .fn()
            .mockResolvedValue(
              opts.serverName !== undefined
                ? { name: opts.serverName }
                : { name: 'my-server' },
            ),
    },
  } as never;

  const notifications = {
    notifyDockerConnectionDown: opts.notifyError
      ? jest.fn().mockRejectedValue(new Error('smtp down'))
      : jest.fn().mockResolvedValue(undefined),
    notifyDockerConnectionRecovered: opts.notifyError
      ? jest.fn().mockRejectedValue(new Error('smtp down'))
      : jest.fn().mockResolvedValue(undefined),
  } as never;

  return {
    listener: new DockerConnectionNotificationsListener(notifications, prisma),
    notifications,
    prisma,
  };
}

describe('DockerConnectionNotificationsListener', () => {
  describe('onUnreachable', () => {
    it('calls notifyDockerConnectionDown with event fields', async () => {
      const { listener, notifications } = makeSvc();
      await listener.onUnreachable({
        serverId: 'srv1',
        endpoint: 'tcp://1.2.3.4:2376',
        lastError: 'connection refused',
        failedSince: new Date('2026-01-01'),
      });
      expect(notifications.notifyDockerConnectionDown).toHaveBeenCalledWith(
        expect.objectContaining({
          serverId: 'srv1',
          serverName: 'my-server',
          endpoint: 'tcp://1.2.3.4:2376',
          lastError: 'connection refused',
        }),
      );
    });

    it('omits serverName when server is not found', async () => {
      const { listener, notifications } = makeSvc({ serverName: null });
      await listener.onUnreachable({
        serverId: 'srv1',
        endpoint: 'tcp://1.2.3.4:2376',
        lastError: 'err',
        failedSince: new Date(),
      });
      const call = (notifications.notifyDockerConnectionDown as jest.Mock).mock
        .calls[0][0];
      expect(call.serverName).toBeUndefined();
    });

    it('does not throw when notifyDockerConnectionDown fails', async () => {
      const { listener } = makeSvc({ notifyError: true });
      await expect(
        listener.onUnreachable({
          serverId: 'srv1',
          endpoint: 'tcp://x',
          lastError: 'e',
          failedSince: new Date(),
        }),
      ).resolves.not.toThrow();
    });

    it('does not throw when DB lookup fails', async () => {
      const { listener } = makeSvc({ serverLookupError: true });
      await expect(
        listener.onUnreachable({
          serverId: 'srv1',
          endpoint: 'tcp://x',
          lastError: 'e',
          failedSince: new Date(),
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('onRecovered', () => {
    it('calls notifyDockerConnectionRecovered with event fields', async () => {
      const { listener, notifications } = makeSvc();
      await listener.onRecovered({
        serverId: 'srv1',
        endpoint: 'tcp://1.2.3.4:2376',
      });
      expect(
        notifications.notifyDockerConnectionRecovered,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          serverId: 'srv1',
          serverName: 'my-server',
          endpoint: 'tcp://1.2.3.4:2376',
        }),
      );
    });

    it('does not throw when notify fails', async () => {
      const { listener } = makeSvc({ notifyError: true });
      await expect(
        listener.onRecovered({ serverId: 'srv1', endpoint: 'tcp://x' }),
      ).resolves.not.toThrow();
    });
  });
});
