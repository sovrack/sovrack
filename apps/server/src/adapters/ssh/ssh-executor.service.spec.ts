import type { SshConnection, SshExecResult } from './ports/ssh-executor.port';
import { SshExecutorService } from './ssh-executor.service';

function makeConn(execResult: Partial<SshExecResult> = {}) {
  const r: SshExecResult = { stdout: '', stderr: '', code: 0, ...execResult };
  const client = {
    execCommand: jest.fn().mockResolvedValue(r),
    dispose: jest.fn(),
  };
  const conn: SshConnection = {
    client: client as never,
    dispose: jest.fn().mockResolvedValue(undefined),
  };
  return { conn, client };
}

describe('SshExecutorService', () => {
  const svc = new SshExecutorService();

  describe('exec', () => {
    it('delegates to client.execCommand and maps the result', async () => {
      const { conn, client } = makeConn({
        stdout: 'hello',
        stderr: '',
        code: 0,
      });
      const result = await svc.exec(conn, 'echo hello');
      expect(client.execCommand).toHaveBeenCalledWith('echo hello');
      expect(result).toEqual({ stdout: 'hello', stderr: '', code: 0 });
    });
  });

  describe('execOrThrow', () => {
    it('resolves when exit code is 0', async () => {
      const { conn } = makeConn({ code: 0 });
      await expect(
        svc.execOrThrow(conn, 'ls', 'ls failed'),
      ).resolves.toBeUndefined();
    });

    it('throws when exit code is non-zero (with stderr)', async () => {
      const { conn } = makeConn({ code: 1, stderr: 'permission denied' });
      await expect(
        svc.execOrThrow(conn, 'sudo whoami', 'sudo failed'),
      ).rejects.toThrow('sudo failed: permission denied');
    });

    it('throws when exit code is non-zero (stdout fallback)', async () => {
      const { conn } = makeConn({
        code: 1,
        stderr: '',
        stdout: 'command not found',
      });
      await expect(
        svc.execOrThrow(conn, 'foobar', 'foobar failed'),
      ).rejects.toThrow('foobar failed: command not found');
    });
  });

  describe('putContent', () => {
    it('writes content to a remote path via cat', async () => {
      const { conn, client } = makeConn({ code: 0 });
      await svc.putContent(conn, '/etc/app/config.json', '{"key":"val"}');
      const calls = (client.execCommand as jest.Mock).mock.calls.map(
        (c: unknown[]) => c[0] as string,
      );
      expect(calls.some((cmd) => cmd.includes('mkdir -p'))).toBe(true);
      expect(calls.some((cmd) => cmd.includes('cat >'))).toBe(true);
    });

    it('throws when the cat command fails', async () => {
      const { conn, client } = makeConn({ code: 0 });
      (client.execCommand as jest.Mock)
        .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0 }) // mkdir
        .mockResolvedValueOnce({ stdout: '', stderr: 'disk full', code: 1 }); // cat
      await expect(
        svc.putContent(conn, '/data/file.txt', 'content'),
      ).rejects.toThrow('putContent to /data/file.txt failed');
    });
  });

  describe('buildHostVerifier', () => {
    it('returns true when key matches the expected base64', () => {
      const expected = Buffer.from('my-host-key').toString('base64');
      const verify = svc.buildHostVerifier(expected);
      expect(verify(Buffer.from('my-host-key'))).toBe(true);
    });

    it('returns false when key does not match', () => {
      const expected = Buffer.from('correct-key').toString('base64');
      const verify = svc.buildHostVerifier(expected);
      expect(verify(Buffer.from('wrong-key'))).toBe(false);
    });

    it('accepts a string key (not just Buffer)', () => {
      const expected = Buffer.from('key-data').toString('base64');
      const verify = svc.buildHostVerifier(expected);
      expect(verify(expected)).toBe(true);
    });
  });

  describe('withTimeout', () => {
    it('resolves when the task finishes before the timeout', async () => {
      const result = await svc.withTimeout(() => Promise.resolve('done'), 1000);
      expect(result).toBe('done');
    });

    it('rejects with SSH_TIMEOUT error when task exceeds timeout', async () => {
      const never = new Promise<string>(() => {
        /* never resolves */
      });
      await expect(svc.withTimeout(() => never, 10)).rejects.toThrow(
        'SSH_TIMEOUT_10',
      );
    });

    it('calls onTimeout callback when the timeout fires', async () => {
      const onTimeout = jest.fn();
      const never = new Promise<string>(() => {});
      await expect(
        svc.withTimeout(() => never, 10, onTimeout),
      ).rejects.toThrow();
      expect(onTimeout).toHaveBeenCalled();
    });
  });
});
