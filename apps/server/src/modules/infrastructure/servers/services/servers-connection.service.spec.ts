import { BadRequestException } from '@nestjs/common';
import { ServerConnectionMode } from '@prisma/client';
import { createServer } from 'net';
import { ServersConnectionService } from './servers-connection.service';
import { ServerConnectionModeDto } from '../dto/create-server.dto';

function makeSvc() {
  const prisma = { server: { findUnique: jest.fn(), update: jest.fn() } } as never;
  const crypto = {
    decrypt: jest.fn().mockReturnValue('key'),
    normalizePrivateKeyFormat: jest.fn((k: string) => k),
  } as never;
  const hostKeys = {
    resolveForConnection: jest.fn().mockResolvedValue({ keyBase64: 'b64', knownHostsLine: 'kh' }),
    isStrictMode: jest.fn().mockReturnValue(false),
  } as never;
  const verification = {
    startVerification: jest.fn().mockResolvedValue(undefined),
    addLog: jest.fn().mockResolvedValue(undefined),
    markSshValidated: jest.fn().mockResolvedValue({ id: 'srv1' }),
    markFailed: jest.fn().mockResolvedValue(undefined),
  } as never;
  const config = { get: jest.fn().mockReturnValue('false') } as never;
  const sshExecutor = { connect: jest.fn() } as never;
  return {
    svc: new ServersConnectionService(prisma, crypto, hostKeys, verification, config, sshExecutor),
    prisma, crypto, hostKeys, verification, config, sshExecutor,
  };
}

describe('ServersConnectionService', () => {
  describe('mapConnectionMode', () => {
    it('defaults to SSH when mode is not provided', () => {
      const { svc } = makeSvc();
      expect(svc.mapConnectionMode(undefined)).toBe(ServerConnectionMode.SSH);
    });

    it('always returns SSH mode', () => {
      const { svc } = makeSvc();
      expect(svc.mapConnectionMode(ServerConnectionModeDto.SSH)).toBe(ServerConnectionMode.SSH);
      expect(svc.mapConnectionMode(undefined)).toBe(ServerConnectionMode.SSH);
    });
  });

  describe('execOrThrow', () => {
    it('resolves when exit code is 0', async () => {
      const { svc } = makeSvc();
      const ssh = { execCommand: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }) } as never;
      await expect(svc.execOrThrow(ssh, 'ls', 'ls failed')).resolves.toBeUndefined();
    });

    it('throws BadRequestException with stderr when exit code is non-zero', async () => {
      const { svc } = makeSvc();
      const ssh = { execCommand: jest.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'permission denied' }) } as never;
      await expect(svc.execOrThrow(ssh, 'sudo', 'sudo failed')).rejects.toThrow(
        'sudo failed: permission denied',
      );
    });

    it('falls back to stdout when stderr is empty', async () => {
      const { svc } = makeSvc();
      const ssh = { execCommand: jest.fn().mockResolvedValue({ code: 1, stdout: 'command not found', stderr: '' }) } as never;
      await expect(svc.execOrThrow(ssh, 'foobar', 'foobar failed')).rejects.toThrow(
        'foobar failed: command not found',
      );
    });

    it('falls back to "erreur inconnue" when both stdout and stderr are empty', async () => {
      const { svc } = makeSvc();
      const ssh = { execCommand: jest.fn().mockResolvedValue({ code: 2, stdout: '', stderr: '' }) } as never;
      await expect(svc.execOrThrow(ssh, 'cmd', 'cmd failed')).rejects.toThrow(
        'cmd failed: erreur inconnue',
      );
    });
  });

  describe('closeConnection', () => {
    it('calls dispose on the connection', () => {
      const { svc } = makeSvc();
      const connection = { target: {} as never, dispose: jest.fn().mockResolvedValue(undefined) };
      svc.closeConnection(connection);
      expect(connection.dispose).toHaveBeenCalled();
    });
  });

  describe('withTimeout', () => {
    it('resolves when task finishes before the timeout', async () => {
      const { svc } = makeSvc();
      const result = await svc.withTimeout(() => Promise.resolve('done'), 1000);
      expect(result).toBe('done');
    });

    it('rejects with JOB_TIMEOUT error when task exceeds timeout', async () => {
      const { svc } = makeSvc();
      const never = new Promise<string>(() => {});
      await expect(svc.withTimeout(() => never, 10)).rejects.toThrow('JOB_TIMEOUT_10');
    });

    it('calls onTimeout callback when timeout fires', async () => {
      const { svc } = makeSvc();
      const onTimeout = jest.fn();
      const never = new Promise<string>(() => {});
      await expect(svc.withTimeout(() => never, 10, onTimeout)).rejects.toThrow();
      expect(onTimeout).toHaveBeenCalled();
    });

    it('clears the timer when task resolves before timeout', async () => {
      const { svc } = makeSvc();
      const clearSpy = jest.spyOn(global, 'clearTimeout');
      await svc.withTimeout(() => Promise.resolve(42), 500);
      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });
  });

  describe('openConnection', () => {
    it('calls sshExecutor.connect with server credentials', async () => {
      const { svc, sshExecutor, crypto } = makeSvc();
      const mockConn = { client: {} as never, dispose: jest.fn() };
      (sshExecutor.connect as jest.Mock).mockResolvedValue(mockConn);
      (crypto.decrypt as jest.Mock).mockReturnValue('decrypted-key');

      const server = {
        id: 'srv1', host: '1.2.3.4', port: 22, username: 'admin',
        sshKey: 'enc-key', knownHostKey: 'base64key',
      } as never;

      await svc.openConnection(server, 'expected-b64-key');

      expect(sshExecutor.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          host: '1.2.3.4',
          port: 22,
          username: 'admin',
          expectedHostKey: 'expected-b64-key',
        }),
      );
    });

    it('returns connection with target and dispose', async () => {
      const { svc, sshExecutor } = makeSvc();
      const mockClient = {} as never;
      const mockConn = { client: mockClient, dispose: jest.fn() };
      (sshExecutor.connect as jest.Mock).mockResolvedValue(mockConn);

      const server = {
        id: 's', host: 'h', port: 22, username: 'u',
        sshKey: 'k', knownHostKey: 'b',
      } as never;

      const conn = await svc.openConnection(server, 'b64');
      expect(conn.target).toBe(mockClient);
      expect(typeof conn.dispose).toBe('function');
    });
  });

  // A3: real TCP behavior, not mocked — pingReachable is a thin wrapper
  // around Node's net.Socket, so the most meaningful test is against an
  // actual local listener/closed port rather than a mock of `net` itself.
  describe('pingReachable', () => {
    it('resolves true when the port accepts a TCP connection', async () => {
      const { svc } = makeSvc();
      const server = createServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as { port: number }).port;

      try {
        await expect(svc.pingReachable('127.0.0.1', port)).resolves.toBe(true);
      } finally {
        server.close();
      }
    });

    it('resolves false when nothing is listening on the port', async () => {
      const { svc } = makeSvc();
      // Port 1 is a reserved/privileged port essentially never bound in a
      // test environment — ECONNREFUSED is the expected, fast outcome.
      await expect(svc.pingReachable('127.0.0.1', 1, 500)).resolves.toBe(
        false,
      );
    });

    it('resolves false (not hung) when the host does not respond before the timeout', async () => {
      const { svc } = makeSvc();
      // 10.255.255.1 is a non-routable address commonly used to simulate a
      // silent drop — the timeout must fire well before Node's own default.
      const start = Date.now();
      const result = await svc.pingReachable('10.255.255.1', 22, 300);
      expect(result).toBe(false);
      expect(Date.now() - start).toBeLessThan(2000);
    });
  });

  describe('registerRunnerDirect', () => {
    it('throws BadRequestException when signal is already aborted', async () => {
      const { svc } = makeSvc();
      const abortedSignal = { aborted: true } as AbortSignal;
      const server = { id: 's', host: 'h', port: 22, username: 'u', sshKey: 'k', name: 'My Server' } as never;
      await expect(
        svc.registerRunnerDirect(server, 'https://gitlab.com', 'token', {
          signal: abortedSignal,
          timeoutMs: 30000,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
