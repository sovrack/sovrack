import { EventEmitter } from 'events';
import { SshSessionService } from './ssh-session.service';

jest.mock('ssh2');

import { Client as SshClient } from 'ssh2';

function makeStream(opts: { closed?: boolean } = {}) {
  const emitter = new EventEmitter() as EventEmitter & {
    write: jest.Mock;
    end: jest.Mock;
    destroyed: boolean;
    setWindow: jest.Mock;
    stderr: EventEmitter;
  };
  emitter.write = jest.fn();
  emitter.end = jest.fn();
  emitter.destroyed = opts.closed ?? false;
  emitter.setWindow = jest.fn();
  emitter.stderr = new EventEmitter();
  return emitter;
}

function makeClient(
  opts: {
    readyError?: Error;
    shellError?: Error;
    noShell?: boolean;
    customStream?: ReturnType<typeof makeStream>;
  } = {},
) {
  const stream = opts.customStream ?? makeStream();
  const client = new EventEmitter() as EventEmitter & {
    shell: jest.Mock;
    connect: jest.Mock;
    end: jest.Mock;
  };
  client.connect = jest.fn().mockImplementation(() => {
    setImmediate(() => {
      if (opts.readyError) {
        client.emit('error', opts.readyError);
      } else {
        client.emit('ready');
      }
    });
  });
  client.shell = jest.fn().mockImplementation((_opts, cb) => {
    if (opts.shellError) {
      setImmediate(() => cb(opts.shellError, null));
    } else if (!opts.noShell) {
      setImmediate(() => cb(null, stream));
    }
  });
  client.end = jest.fn();
  return { client, stream };
}

function patchClientConstructor(
  clientInstance: ReturnType<typeof makeClient>['client'],
) {
  (SshClient as jest.Mock).mockImplementation(() => clientInstance);
}

function makeInput(overrides = {}) {
  return {
    host: '1.2.3.4',
    port: 22,
    username: 'admin',
    privateKey: 'private-key',
    cols: 80,
    rows: 24,
    readyTimeoutMs: 5000,
    keepaliveIntervalMs: 0,
    inactivityTimeoutMs: 0,
    ...overrides,
  };
}

function makeHandlers() {
  return {
    onData: jest.fn(),
    onClose: jest.fn(),
    onError: jest.fn(),
  };
}

describe('SshSessionService', () => {
  const svc = new SshSessionService();

  describe('openShell', () => {
    it('resolves with write/resize/close entry on successful connection', async () => {
      const { client } = makeClient();
      patchClientConstructor(client);
      const entry = await svc.openShell(makeInput(), makeHandlers());
      expect(entry).toHaveProperty('write');
      expect(entry).toHaveProperty('resize');
      expect(entry).toHaveProperty('close');
    });

    it('rejects when SSH connection emits error before ready', async () => {
      const { client } = makeClient({ readyError: new Error('Auth failed') });
      patchClientConstructor(client);
      await expect(svc.openShell(makeInput(), makeHandlers())).rejects.toThrow(
        'Auth failed',
      );
    });

    it('calls onError when SSH connection emits error', async () => {
      const { client } = makeClient({
        readyError: new Error('Connection refused'),
      });
      patchClientConstructor(client);
      const handlers = makeHandlers();
      await expect(svc.openShell(makeInput(), handlers)).rejects.toThrow();
      expect(handlers.onError).toHaveBeenCalledWith(
        expect.stringContaining('Connection refused'),
      );
    });

    it('rejects when shell callback receives error', async () => {
      const { client } = makeClient({ shellError: new Error('PTY failed') });
      patchClientConstructor(client);
      await expect(svc.openShell(makeInput(), makeHandlers())).rejects.toThrow(
        'PTY failed',
      );
    });

    it('streams data via onData when stream emits data event', async () => {
      const { client, stream } = makeClient();
      patchClientConstructor(client);
      const handlers = makeHandlers();
      await svc.openShell(makeInput(), handlers);
      stream.emit('data', Buffer.from('hello'));
      expect(handlers.onData).toHaveBeenCalledWith('hello');
    });

    it('forwards string data directly without re-encoding', async () => {
      const { client, stream } = makeClient();
      patchClientConstructor(client);
      const handlers = makeHandlers();
      await svc.openShell(makeInput(), handlers);
      stream.emit('data', 'world');
      expect(handlers.onData).toHaveBeenCalledWith('world');
    });

    it('streams stderr data via onData', async () => {
      const { client, stream } = makeClient();
      patchClientConstructor(client);
      const handlers = makeHandlers();
      await svc.openShell(makeInput(), handlers);
      stream.stderr.emit('data', Buffer.from('error output'));
      expect(handlers.onData).toHaveBeenCalledWith('error output');
    });

    it('calls onClose when stream emits close', async () => {
      const { client, stream } = makeClient();
      patchClientConstructor(client);
      const handlers = makeHandlers();
      await svc.openShell(makeInput(), handlers);
      stream.emit('close', 0);
      expect(handlers.onClose).toHaveBeenCalledWith(0);
    });

    it('entry.write forwards data to stream', async () => {
      const { client, stream } = makeClient();
      patchClientConstructor(client);
      const entry = await svc.openShell(makeInput(), makeHandlers());
      entry.write('input text');
      expect(stream.write).toHaveBeenCalledWith('input text');
    });

    it('entry.write is a no-op when stream is destroyed', async () => {
      const customStream = makeStream({ closed: true });
      const { client } = makeClient({ customStream });
      patchClientConstructor(client);
      const entry = await svc.openShell(makeInput(), makeHandlers());
      entry.write('ignored');
      expect(customStream.write).not.toHaveBeenCalled();
    });

    it('entry.resize calls setWindow with transposed rows/cols', async () => {
      const { client, stream } = makeClient();
      patchClientConstructor(client);
      const entry = await svc.openShell(makeInput(), makeHandlers());
      entry.resize(120, 40);
      expect(stream.setWindow).toHaveBeenCalledWith(40, 120, 0, 0);
    });

    it('entry.close calls stream.end and conn.end', async () => {
      const { client, stream } = makeClient();
      patchClientConstructor(client);
      const entry = await svc.openShell(makeInput(), makeHandlers());
      entry.close();
      expect(stream.end).toHaveBeenCalled();
      expect(client.end).toHaveBeenCalled();
    });

    it('fires inactivity timeout after inactivityTimeoutMs of silence', async () => {
      const { client } = makeClient();
      patchClientConstructor(client);
      const handlers = makeHandlers();
      // Use a 50 ms inactivity window so the real timer fires quickly.
      await svc.openShell(makeInput({ inactivityTimeoutMs: 50 }), handlers);
      // Wait long enough for the inactivity timer to fire.
      await new Promise<void>((r) => setTimeout(r, 80));
      expect(handlers.onError).toHaveBeenCalledWith(
        expect.stringContaining('inactivité'),
      );
    });
  });
});
