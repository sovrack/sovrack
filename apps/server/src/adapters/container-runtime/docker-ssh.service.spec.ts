import type { SshConnection, SshExecResult } from '../ssh/ssh-executor.service';
import { DockerSshService } from './docker-ssh.service';

function makeExec(stdout = '', stderr = '', code = 0): jest.Mock {
  return jest
    .fn()
    .mockResolvedValue({ stdout, stderr, code } satisfies SshExecResult);
}

function makeSvc(execMock?: jest.Mock) {
  const exec = execMock ?? makeExec();
  const ssh = { exec };
  const svc = new DockerSshService(ssh as never);
  const conn = {} as SshConnection;
  return { svc, conn, exec };
}

describe('DockerSshService', () => {
  describe('containerStats', () => {
    it('returns trimmed stats line', async () => {
      const { svc, conn, exec } = makeSvc(makeExec(' abc|name|10% \n'));
      const result = await svc.containerStats(conn, 'app');
      expect(result).toBe('abc|name|10%');
      const cmd = exec.mock.calls[0][1] as string;
      expect(cmd).toContain('docker stats');
      expect(cmd).toContain("'app'");
    });
  });

  describe('containerStatus', () => {
    it('returns trimmed status string', async () => {
      const { svc, conn } = makeSvc(makeExec('Up 2 hours\n'));
      expect(await svc.containerStatus(conn, 'app')).toBe('Up 2 hours');
    });
  });

  describe('containerLogs', () => {
    it('fetches logs with tail count', async () => {
      const { svc, conn, exec } = makeSvc(makeExec('log line 1\nlog line 2\n'));
      const result = await svc.containerLogs(conn, 'app', 50);
      expect(result).toContain('log line 1');
      const cmd = exec.mock.calls[0][1] as string;
      expect(cmd).toContain('--tail 50');
    });
  });

  describe('findContainerByName', () => {
    it('returns the first matching container name', async () => {
      const { svc, conn } = makeSvc(makeExec('deploy-myapp-api-abc1\n'));
      expect(await svc.findContainerByName(conn, 'myapp')).toBe(
        'deploy-myapp-api-abc1',
      );
    });

    it('returns empty string when no container matches', async () => {
      const { svc, conn } = makeSvc(makeExec(''));
      expect(await svc.findContainerByName(conn, 'ghost')).toBe('');
    });
  });

  describe('listContainerNames', () => {
    it('returns trimmed names output', async () => {
      const { svc, conn } = makeSvc(makeExec('container1\ncontainer2\n'));
      expect(await svc.listContainerNames(conn)).toBe('container1\ncontainer2');
    });
  });

  describe('logsRaw', () => {
    it('returns the full SshExecResult', async () => {
      const r: SshExecResult = { stdout: 'raw log', stderr: '', code: 0 };
      const { svc, conn, exec } = makeSvc(jest.fn().mockResolvedValue(r));
      const result = await svc.logsRaw(conn, 'app', 100);
      expect(result).toEqual(r);
      const cmd = exec.mock.calls[0][1] as string;
      expect(cmd).toContain('--tail=100');
    });
  });

  describe('composePs', () => {
    it('returns empty array when output is empty', async () => {
      const { svc, conn } = makeSvc(makeExec(''));
      expect(await svc.composePs(conn, 'myproject')).toEqual([]);
    });

    it('parses NDJSON (one object per line)', async () => {
      const ndjson =
        '{"Name":"app","State":"running","ID":"abc"}\n' +
        '{"Name":"db","State":"running","ID":"def"}';
      const { svc, conn } = makeSvc(makeExec(ndjson));
      const result = await svc.composePs(conn, 'myproject');
      expect(result).toHaveLength(2);
      expect(result[0].Name).toBe('app');
    });

    it('parses JSON array (newer Compose format)', async () => {
      const json = '[{"Name":"app","State":"running","ID":"abc"}]';
      const { svc, conn } = makeSvc(makeExec(json));
      const result = await svc.composePs(conn, 'myproject');
      expect(result).toHaveLength(1);
      expect(result[0].State).toBe('running');
    });

    it('returns empty array for unparseable output', async () => {
      const { svc, conn } = makeSvc(makeExec('not json at all'));
      expect(await svc.composePs(conn, 'myproject')).toEqual([]);
    });

    it('skips malformed NDJSON lines gracefully', async () => {
      const ndjson = '{"Name":"ok","State":"running","ID":"1"}\n{bad json}';
      const { svc, conn } = makeSvc(makeExec(ndjson));
      const result = await svc.composePs(conn, 'myproject');
      expect(result).toHaveLength(1);
    });
  });

  describe('imageDigest', () => {
    it('returns sha256 digest from stdout', async () => {
      const { svc, conn } = makeSvc(makeExec('sha256:abc123def456\n'));
      expect(await svc.imageDigest(conn, 'app:latest')).toBe(
        'sha256:abc123def456',
      );
    });

    it('returns null when no sha256 line is found', async () => {
      const { svc, conn } = makeSvc(makeExec('Error: No such image\n'));
      expect(await svc.imageDigest(conn, 'ghost:latest')).toBeNull();
    });

    it('finds sha256 among multiple output lines', async () => {
      const { svc, conn } = makeSvc(
        makeExec('sha256:firsthash\nsome other line\n'),
      );
      expect(await svc.imageDigest(conn, 'app:latest')).toBe(
        'sha256:firsthash',
      );
    });
  });

  describe('projectStats', () => {
    it('includes the project slug in the grep pattern', async () => {
      const { svc, conn, exec } = makeSvc(makeExec(''));
      await svc.projectStats(conn, 'my-app');
      const cmd = exec.mock.calls[0][1] as string;
      expect(cmd).toContain('deploy-my-app-');
    });

    it('escapes dots in project slug with [.-] pattern', async () => {
      const { svc, conn, exec } = makeSvc(makeExec(''));
      await svc.projectStats(conn, 'my.app');
      const cmd = exec.mock.calls[0][1] as string;
      expect(cmd).toContain('deploy-my[.-]app-');
    });
  });
});
