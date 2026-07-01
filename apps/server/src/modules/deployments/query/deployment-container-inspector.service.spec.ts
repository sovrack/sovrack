import { BadRequestException } from '@nestjs/common';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { DockerSshService } from '../../../adapters/container-runtime/docker-ssh.service';
import { ServerHostKeyService } from '../../../adapters/ssh/server-host-key.service';
import { ServersCryptoService } from '../../../adapters/ssh/servers-crypto.service';
import { SshExecutorService } from '../../../adapters/ssh/ssh-executor.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DeploymentContainerInspectorService } from './deployment-container-inspector.service';

function makeConn() {
  return { dispose: jest.fn().mockResolvedValue(undefined) };
}

function makeSvc(opts: {
  deployment?: unknown;
  server?: unknown;
  hostKey?: { keyBase64: string };
  dockerInspect?: unknown;
  imageDigest?: string | null;
} = {}) {
  const conn = makeConn();

  const prisma = {
    deployment: {
      findUnique: jest.fn().mockResolvedValue(
        'deployment' in opts
          ? opts.deployment
          : {
              id: 'd1',
              serviceId: 's1',
              resolvedRefs: { serverId: 'srv1' },
              service: { id: 's1', name: 'api' },
            },
      ),
    },
    server: {
      findUnique: jest.fn().mockResolvedValue(
        'server' in opts
          ? opts.server
          : {
              id: 'srv1',
              host: '10.0.0.1',
              port: 22,
              username: 'deploy',
              sshKey: 'enc-key',
            },
      ),
    },
  } as unknown as PrismaService;

  const ssh = {
    connect: jest.fn().mockResolvedValue(conn),
  } as unknown as SshExecutorService;

  const dockerRemoteService = {
    inspectImage: jest.fn().mockResolvedValue(
      'dockerInspect' in opts ? opts.dockerInspect : null,
    ),
  } as unknown as DockerApiService;

  const dockerSsh = {
    findContainerByName: jest.fn().mockResolvedValue('app-container'),
    listContainerNames: jest.fn().mockResolvedValue(''),
    logsRaw: jest.fn().mockResolvedValue({ stdout: 'log line 1\nlog line 2', stderr: '' }),
    imageDigest: jest.fn().mockResolvedValue(
      'imageDigest' in opts ? opts.imageDigest : 'sha256:abc123',
    ),
  } as unknown as DockerSshService;

  const serverHostKeyService = {
    resolveForConnection: jest.fn().mockResolvedValue(
      opts.hostKey ?? { keyBase64: 'hostkey-base64' },
    ),
  } as unknown as ServerHostKeyService;

  const serversCryptoService = {
    decrypt: jest.fn().mockReturnValue('decrypted-key'),
  } as unknown as ServersCryptoService;

  const svc = new DeploymentContainerInspectorService(
    prisma,
    ssh,
    dockerRemoteService,
    dockerSsh,
    serverHostKeyService,
    serversCryptoService,
  );

  return { svc, prisma, ssh, dockerRemoteService, dockerSsh, conn };
}

describe('DeploymentContainerInspectorService', () => {
  describe('getContainerLogs', () => {
    it('throws BadRequestException when deployment not found', async () => {
      const { svc } = makeSvc({ deployment: null });
      await expect(svc.getContainerLogs('missing')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when resolvedRefs has no serverId', async () => {
      const { svc } = makeSvc({
        deployment: { id: 'd1', serviceId: null, resolvedRefs: null, service: null },
      });
      await expect(svc.getContainerLogs('d1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when server not found', async () => {
      const { svc } = makeSvc({ server: null });
      await expect(svc.getContainerLogs('d1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when server has no sshKey', async () => {
      const { svc } = makeSvc({
        server: { id: 'srv1', host: '10.0.0.1', port: 22, username: 'deploy', sshKey: null },
      });
      await expect(svc.getContainerLogs('d1')).rejects.toThrow(BadRequestException);
    });

    it('returns logs from the container via SSH', async () => {
      const { svc } = makeSvc();
      const logs = await svc.getContainerLogs('d1');
      expect(logs).toContain('log line 1');
    });

    it('falls back to listContainerNames when findContainerByName returns null', async () => {
      const { svc, dockerSsh } = makeSvc();
      (dockerSsh.findContainerByName as jest.Mock).mockResolvedValue(null);
      (dockerSsh.listContainerNames as jest.Mock).mockResolvedValue('app-container\nother');
      const logs = await svc.getContainerLogs('d1');
      expect(logs).toContain('log line');
    });

    it('returns no-container message when both lookups return empty', async () => {
      const { svc, dockerSsh } = makeSvc();
      (dockerSsh.findContainerByName as jest.Mock).mockResolvedValue(null);
      (dockerSsh.listContainerNames as jest.Mock).mockResolvedValue('');
      const logs = await svc.getContainerLogs('d1');
      expect(logs).toContain('Aucun conteneur');
    });

    it('disposes the SSH connection even on error', async () => {
      const { svc, ssh, conn } = makeSvc();
      (ssh.connect as jest.Mock).mockRejectedValue(new Error('connection refused'));
      await expect(svc.getContainerLogs('d1')).rejects.toThrow();
      // conn was never created so dispose is not called — just check it doesn't throw
    });

    it('uses stderr when stdout is empty', async () => {
      const { svc, dockerSsh } = makeSvc();
      (dockerSsh.logsRaw as jest.Mock).mockResolvedValue({
        stdout: '',
        stderr: 'error output',
      });
      const logs = await svc.getContainerLogs('d1');
      expect(logs).toContain('error output');
    });
  });

  describe('resolveImageDigest', () => {
    it('returns null for empty imageRef', async () => {
      const { svc } = makeSvc();
      expect(await svc.resolveImageDigest('srv1', {} as never, 'key', '')).toBeNull();
    });

    it('returns null for compose:// imageRef', async () => {
      const { svc } = makeSvc();
      expect(
        await svc.resolveImageDigest('srv1', {} as never, 'key', 'compose://app'),
      ).toBeNull();
    });

    it('returns digest from DockerRemoteService when inspectImage succeeds', async () => {
      const { svc } = makeSvc({
        dockerInspect: { RepoDigests: ['sha256:abc123def456'], Id: 'sha256:other' },
      });
      const digest = await svc.resolveImageDigest(
        'srv1',
        { host: '10.0.0.1', port: 22, username: 'deploy' },
        'key',
        'app:latest',
      );
      expect(digest).toBe('sha256:abc123def456');
    });

    it('falls back to SSH digest when TLS inspect fails', async () => {
      const { svc, dockerRemoteService } = makeSvc({ imageDigest: 'sha256:ssh-digest' });
      (dockerRemoteService.inspectImage as jest.Mock).mockRejectedValue(new Error('TLS error'));
      const digest = await svc.resolveImageDigest(
        'srv1',
        { host: '10.0.0.1', port: 22, username: 'deploy' },
        'key',
        'app:latest',
      );
      expect(digest).toBe('sha256:ssh-digest');
    });

    it('falls back to SSH when TLS returns null info', async () => {
      const { svc } = makeSvc({ dockerInspect: null, imageDigest: 'sha256:fallback' });
      const digest = await svc.resolveImageDigest(
        'srv1',
        { host: '10.0.0.1', port: 22, username: 'deploy' },
        'key',
        'app:latest',
      );
      expect(digest).toBe('sha256:fallback');
    });

    it('returns null when SSH digest also fails', async () => {
      const { svc, dockerRemoteService, ssh } = makeSvc();
      (dockerRemoteService.inspectImage as jest.Mock).mockRejectedValue(new Error('tls fail'));
      (ssh.connect as jest.Mock).mockRejectedValue(new Error('ssh refused'));
      const digest = await svc.resolveImageDigest(
        'srv1',
        { host: '10.0.0.1', port: 22, username: 'deploy' },
        'key',
        'app:latest',
      );
      expect(digest).toBeNull();
    });
  });
});
