import { ContainersGateway } from './containers.gateway';

function makeClient(id = 'client-1') {
  return {
    id,
    emit: jest.fn(),
    disconnect: jest.fn(),
    data: { user: { id: 'user-1', role: 'OWNER' } },
    handshake: { auth: {}, headers: {} },
  } as never;
}

function makeSvc(
  opts: {
    containerFound?: boolean;
    streamEntries?: string[];
    streamError?: Error;
  } = {},
) {
  const container = { serverId: 'srv1', dockerId: 'docker-abc' };

  const containersService = {
    assertCanAccessContainer:
      opts.containerFound === false
        ? jest.fn().mockRejectedValue(new Error('not found'))
        : jest.fn().mockResolvedValue(undefined),
    findOne:
      opts.containerFound === false
        ? jest.fn().mockRejectedValue(new Error('not found'))
        : jest.fn().mockResolvedValue(container),
  } as never;

  async function* makeStream() {
    if (opts.streamError) throw opts.streamError;
    for (const entry of opts.streamEntries ?? ['line1', 'line2']) {
      yield entry;
    }
  }

  const docker = {
    streamContainerLogs: jest.fn().mockReturnValue(makeStream()),
  } as never;
  const jwt = { verify: jest.fn().mockReturnValue({ id: 'user-1' }) } as never;
  const config = { get: jest.fn().mockReturnValue('access_token') } as never;

  return {
    gateway: new ContainersGateway(containersService, docker, jwt, config),
    containersService,
    docker,
  };
}

describe('ContainersGateway', () => {
  describe('handleConnection', () => {
    it('disconnects a socket without an authentication token', () => {
      const { gateway } = makeSvc();
      const client = makeClient();
      client.data = {};

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('aborts any active stream for the disconnecting client', async () => {
      const { gateway, docker } = makeSvc();
      const client = makeClient('c1');

      // Start a stream (don't await — it's void-launched internally)
      const started = gateway.handleLogsStart(client, { containerId: 'ctn1' });
      // Disconnect while it's running
      gateway.handleDisconnect(client);
      await started;

      // The abort should prevent more log events, but end is still emitted
      expect(docker.streamContainerLogs).toHaveBeenCalled();
    });
  });

  describe('handleLogsStart', () => {
    it('emits container:error when container is not found', async () => {
      const { gateway } = makeSvc({ containerFound: false });
      const client = makeClient();
      await gateway.handleLogsStart(client, { containerId: 'missing' });
      expect(client.emit).toHaveBeenCalledWith('container:error', {
        message: 'Container introuvable',
      });
    });

    it('streams log entries to the client', async () => {
      const { gateway } = makeSvc({ streamEntries: ['log-a', 'log-b'] });
      const client = makeClient();
      await gateway.handleLogsStart(client, { containerId: 'ctn1' });
      // Wait for async void task
      await new Promise((r) => setImmediate(r));
      expect(client.emit).toHaveBeenCalledWith('container:log', 'log-a');
      expect(client.emit).toHaveBeenCalledWith('container:log', 'log-b');
    });

    it('emits container:logs:end after streaming', async () => {
      const { gateway } = makeSvc({ streamEntries: [] });
      const client = makeClient();
      await gateway.handleLogsStart(client, { containerId: 'ctn1' });
      await new Promise((r) => setImmediate(r));
      expect(client.emit).toHaveBeenCalledWith('container:logs:end');
    });

    it('emits container:error when stream throws', async () => {
      const { gateway } = makeSvc({ streamError: new Error('docker gone') });
      const client = makeClient();
      await gateway.handleLogsStart(client, { containerId: 'ctn1' });
      await new Promise((r) => setImmediate(r));
      expect(client.emit).toHaveBeenCalledWith('container:error', {
        message: 'docker gone',
      });
    });

    it('passes tail option to docker.streamContainerLogs', async () => {
      const { gateway, docker } = makeSvc();
      const client = makeClient();
      await gateway.handleLogsStart(client, { containerId: 'ctn1', tail: 50 });
      expect(docker.streamContainerLogs).toHaveBeenCalledWith(
        'srv1',
        'docker-abc',
        expect.objectContaining({ tail: 50 }),
      );
    });
  });

  describe('handleLogsStop', () => {
    it('emits container:logs:end', () => {
      const { gateway } = makeSvc();
      const client = makeClient();
      gateway.handleLogsStop(client);
      expect(client.emit).toHaveBeenCalledWith('container:logs:end');
    });
  });
});
