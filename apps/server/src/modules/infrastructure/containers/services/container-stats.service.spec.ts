import { NotFoundException } from '@nestjs/common';
import { ContainerStatsService } from './container-stats.service';

function makeSvc(
  opts: {
    deployment?: object | null;
    container?: object | null;
    serverStats?: string;
    serverLogs?: string;
    serverStatus?: string;
    projectStats?: string;
    project?: { name: string } | null;
    server?: object | null;
    sshAcquireError?: Error;
  } = {},
) {
  const deployment =
    opts.deployment !== undefined
      ? opts.deployment
      : {
          id: 'dep1',
          project: { id: 'proj1', name: 'My App' },
          service: { id: 'svc1', name: 'api' },
          environment: { id: 'env1', name: 'prod' },
        };

  const container =
    opts.container !== undefined
      ? opts.container
      : {
          deploymentId: 'dep1',
          name: 'deploy-my-app-api-dep1abcd',
          server: {
            id: 'srv1',
            host: '1.2.3.4',
            port: 22,
            username: 'admin',
            sshKey: 'enc-key',
            knownHostKey: 'base64key',
          },
        };

  const server =
    (opts.server !== undefined
      ? opts.server
      : (container as { server?: object } | null)?.server) ?? null;

  const conn = { dispose: jest.fn().mockResolvedValue(undefined) };

  const prisma = {
    deployment: {
      findUnique: jest.fn().mockResolvedValue(deployment),
    },
    container: {
      findFirst: jest.fn().mockResolvedValue(container),
    },
    server: {
      findUnique: jest.fn().mockResolvedValue(server),
    },
    project: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.project !== undefined ? opts.project : { name: 'My App' },
        ),
    },
  } as never;

  const crypto = {
    decrypt: jest.fn().mockReturnValue('decrypted-key'),
  } as never;

  const hostKeys = {
    resolveForConnection: jest
      .fn()
      .mockResolvedValue({ keyBase64: 'base64key' }),
  } as never;

  const sshPool = {
    acquire: opts.sshAcquireError
      ? jest.fn().mockRejectedValue(opts.sshAcquireError)
      : jest.fn().mockResolvedValue(conn),
  } as never;

  const dockerSsh = {
    containerStats: jest
      .fn()
      .mockResolvedValue(
        opts.serverStats ?? 'abc|api|5%|10MiB/20MiB|50%|100B/200B|1KB/2KB|3',
      ),
    containerLogs: jest
      .fn()
      .mockResolvedValue(opts.serverLogs ?? 'log line 1\nlog line 2'),
    containerStatus: jest
      .fn()
      .mockResolvedValue(opts.serverStatus ?? 'Up 2 hours'),
    projectStats: jest
      .fn()
      .mockResolvedValue(
        opts.projectStats ??
          'abc|api|5%|10MiB/20MiB|50%|100B/200B|1KB/2KB|3\ndef|db|2%|5MiB/10MiB|10%|50B/100B|0B/0B|2',
      ),
  } as never;

  const svc = new ContainerStatsService(
    prisma,
    crypto,
    hostKeys,
    sshPool,
    dockerSsh,
  );
  return { svc, prisma, dockerSsh, conn };
}

describe('ContainerStatsService', () => {
  describe('getContainerInfo', () => {
    it('throws NotFoundException when deployment does not exist', async () => {
      const { svc } = makeSvc({ deployment: null });
      await expect(svc.getContainerInfo('dep1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when container/server is not found', async () => {
      const { svc } = makeSvc({ container: null });
      await expect(svc.getContainerInfo('dep1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when container has no server', async () => {
      const { svc } = makeSvc({
        container: { deploymentId: 'dep1', name: 'c1', server: null },
      });
      await expect(svc.getContainerInfo('dep1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('parses 8-field stats line and returns running status', async () => {
      const { svc } = makeSvc();
      const result = await svc.getContainerInfo('dep1');
      expect(result.status).toBe('running');
      expect(result.stats).not.toBeNull();
      expect(result.stats?.cpuPercent).toBe('5%');
      expect(result.stats?.pids).toBe('3');
    });

    it('returns status=stopped when container exists but is not running', async () => {
      const { svc } = makeSvc({ serverStatus: 'Exited (0) 2 hours ago' });
      const result = await svc.getContainerInfo('dep1');
      expect(result.status).toBe('stopped');
    });

    it('returns status=not_found when CONTAINER_NOT_FOUND in logs', async () => {
      const { svc } = makeSvc({
        serverStatus: 'Exited (0)',
        serverLogs: 'CONTAINER_NOT_FOUND',
        serverStats: 'NOT_FOUND',
      });
      const result = await svc.getContainerInfo('dep1');
      expect(result.status).toBe('not_found');
    });

    it('falls back to slugified project+service name when container.name is empty', async () => {
      const { svc, dockerSsh } = makeSvc({
        container: {
          deploymentId: 'dep1',
          name: '',
          server: {
            id: 'srv1',
            host: '1.2.3.4',
            port: 22,
            username: 'admin',
            sshKey: 'enc-key',
            knownHostKey: 'base64key',
          },
        },
      });
      await svc.getContainerInfo('dep1');
      const containerArg = (dockerSsh.containerStats as jest.Mock).mock
        .calls[0][1] as string;
      expect(containerArg).toContain('my-app');
    });

    it('returns unknown status and swallows error when SSH acquire fails', async () => {
      const { svc } = makeSvc({
        sshAcquireError: new Error('connection refused'),
      });
      const result = await svc.getContainerInfo('dep1');
      expect(result.status).toBe('unknown');
      expect(result.stats).toBeNull();
      expect(result.logs).toBe('');
    });

    it('disposes the connection even when stats call throws', async () => {
      const conn = { dispose: jest.fn().mockResolvedValue(undefined) };
      const prisma = {
        deployment: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'dep1',
            project: { id: 'p', name: 'X' },
            service: { name: 'api' },
            environment: {},
          }),
        },
        container: {
          findFirst: jest.fn().mockResolvedValue({
            name: 'cname',
            server: {
              id: 's',
              host: 'h',
              port: 22,
              username: 'u',
              sshKey: 'k',
            },
          }),
        },
      } as never;
      const crypto = { decrypt: jest.fn().mockReturnValue('key') } as never;
      const hostKeys = {
        resolveForConnection: jest.fn().mockResolvedValue({ keyBase64: 'b64' }),
      } as never;
      const sshPool = { acquire: jest.fn().mockResolvedValue(conn) } as never;
      const dockerSsh = {
        containerStats: jest.fn().mockRejectedValue(new Error('docker down')),
        containerLogs: jest.fn(),
        containerStatus: jest.fn(),
      } as never;
      const svc = new ContainerStatsService(
        prisma,
        crypto,
        hostKeys,
        sshPool,
        dockerSsh,
      );
      await svc.getContainerInfo('dep1');
      expect(conn.dispose).toHaveBeenCalled();
    });
  });

  describe('listProjectContainers', () => {
    it('throws NotFoundException when server does not exist', async () => {
      const { svc } = makeSvc({ server: null });
      await expect(
        svc.listProjectContainers('proj1', 'bad-server'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns empty array when projectStats output is empty', async () => {
      const { svc } = makeSvc({ projectStats: '' });
      const result = await svc.listProjectContainers('proj1', 'srv1');
      expect(result).toEqual([]);
    });

    it('parses multiple stats lines into ContainerStats array', async () => {
      const { svc } = makeSvc();
      const result = await svc.listProjectContainers('proj1', 'srv1');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('api');
      expect(result[0].cpuPercent).toBe('5%');
      expect(result[1].name).toBe('db');
      expect(result[1].pids).toBe('2');
    });

    it('uses projectId as slug when project has no name', async () => {
      const { svc, dockerSsh } = makeSvc({ project: null });
      await svc.listProjectContainers('proj-1', 'srv1');
      const slugArg = (dockerSsh.projectStats as jest.Mock).mock
        .calls[0][1] as string;
      expect(slugArg).toBe('proj-1');
    });

    it('all containers have status=running', async () => {
      const { svc } = makeSvc({
        projectStats: 'a|b|1%|1B/1B|1%|1B/1B|1B/1B|1',
      });
      const result = await svc.listProjectContainers('proj1', 'srv1');
      expect(result.every((c) => c.status === 'running')).toBe(true);
    });
  });
});
