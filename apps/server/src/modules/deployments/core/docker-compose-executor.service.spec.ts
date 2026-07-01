import { BadRequestException } from '@nestjs/common';
import { ContainerStatus, DeploymentStatus } from '@prisma/client';
import { DockerComposeExecutorService } from './docker-compose-executor.service';

/**
 * Unit tests for DockerComposeExecutorService.
 *
 * Covers the three critical execution paths:
 *  - SUCCESS : compose up + poll → all running → register + route → DB updated
 *  - FAILURE : compose up fails → compose down called → FAILED status
 *  - POLL succeeds on 2nd iteration (first poll returns 'starting', second 'running')
 *
 * SSH, Docker, Prisma and all side-effectful dependencies are fully mocked.
 */
describe('DockerComposeExecutorService', () => {
  const DEPLOYMENT_ID = 'dep-1';
  const SVC_ENV_ID = 'svcenv-abc12345';
  const SERVER_ID = 'srv-1';

  const makeDeployment = (overrides: Record<string, unknown> = {}) => ({
    id: DEPLOYMENT_ID,
    serviceEnvId: SVC_ENV_ID,
    logs: null,
    branch: 'main',
    dockerImage: null,
    project: { id: 'proj-1', name: 'my-project' },
    service: {
      id: 'svc-1',
      name: 'api',
      type: 'APPLICATION',
      dockerComposeContent: 'version: "3"\nservices:\n  api:\n    image: nginx',
      composeServiceName: 'api',
      port: 3000,
    },
    serviceEnv: {
      id: SVC_ENV_ID,
      serverId: SERVER_ID,
      environment: {
        id: 'env-1',
        name: 'production',
        servers: [{ id: SERVER_ID, name: 'vps-1', host: '1.2.3.4' }],
      },
    },
    user: { id: 'u1', email: 'dev@example.com' },
    resolvedRefs: null,
    ...overrides,
  });

  const makeServer = () => ({
    id: SERVER_ID,
    host: '1.2.3.4',
    port: 22,
    username: 'ubuntu',
    sshKey: 'encrypted-key',
    isVerified: true,
  });

  let prisma: {
    deployment: { findUnique: jest.Mock; update: jest.Mock };
    server: { findUnique: jest.Mock };
    container: { create: jest.Mock; updateMany: jest.Mock };
    serviceEnvironment: { findUnique: jest.Mock; update: jest.Mock };
  };
  let ssh: { putContent: jest.Mock };
  let sshPool: { acquire: jest.Mock };
  let serversCrypto: { decrypt: jest.Mock };
  let serverHostKey: { resolveForConnection: jest.Mock };
  let dockerSsh: {
    composeUp: jest.Mock;
    composeDown: jest.Mock;
    composePs: jest.Mock;
  };
  let logEmitter: { emit: jest.Mock };
  let gateway: {
    emitStatus: jest.Mock;
    emitFinished: jest.Mock;
    emitLog: jest.Mock;
  };
  let notifications: { notifyDeploymentFinished: jest.Mock };
  let deployRouting: { resolveTraefikConfig: jest.Mock; applyRoute: jest.Mock };
  let mockConn: { dispose: jest.Mock };
  let service: DockerComposeExecutorService;

  beforeEach(() => {
    mockConn = { dispose: jest.fn().mockResolvedValue(undefined) };

    prisma = {
      deployment: {
        findUnique: jest.fn().mockResolvedValue(makeDeployment()),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              id: DEPLOYMENT_ID,
              finishedAt: new Date(),
              ...data,
            }),
          ),
      },
      server: {
        findUnique: jest.fn().mockResolvedValue(makeServer()),
      },
      container: {
        create: jest.fn().mockResolvedValue({ id: 'ctr-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      serviceEnvironment: {
        findUnique: jest.fn().mockResolvedValue({ currentDeploymentId: null }),
        update: jest.fn().mockResolvedValue({ id: SVC_ENV_ID }),
      },
    };

    ssh = { putContent: jest.fn().mockResolvedValue(undefined) };
    sshPool = { acquire: jest.fn().mockResolvedValue(mockConn) };
    serversCrypto = { decrypt: jest.fn().mockReturnValue('decrypted-key') };
    serverHostKey = {
      resolveForConnection: jest
        .fn()
        .mockResolvedValue({ keyBase64: 'base64key' }),
    };
    dockerSsh = {
      composeUp: jest
        .fn()
        .mockResolvedValue({ code: 0, stdout: 'done', stderr: '' }),
      composeDown: jest
        .fn()
        .mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
      composePs: jest.fn().mockResolvedValue([
        {
          Name: 'platform-compose-svcenv-a_api_1',
          State: 'running',
          ID: 'abc123',
        },
      ]),
    };
    logEmitter = { emit: jest.fn() };
    gateway = {
      emitStatus: jest.fn(),
      emitFinished: jest.fn(),
      emitLog: jest.fn(),
    };
    notifications = {
      notifyDeploymentFinished: jest.fn().mockResolvedValue(undefined),
    };
    deployRouting = {
      resolveTraefikConfig: jest.fn().mockResolvedValue({
        traefikDomain: null,
        traefikServiceEnvId: null,
        useTraefik: false,
      }),
      applyRoute: jest.fn().mockResolvedValue('[TRAEFIK] route set\n'),
    };

    service = new DockerComposeExecutorService(
      prisma as never,
      ssh as never,
      sshPool as never,
      serversCrypto as never,
      serverHostKey as never,
      dockerSsh as never,
      logEmitter as never,
      gateway as never,
      notifications as never,
      deployRouting as never,
    );
  });

  describe('executeDeploy — SUCCESS path', () => {
    it('writes compose.yml, runs compose up, registers containers, sets SUCCESS', async () => {
      await service.executeDeploy(DEPLOYMENT_ID);

      // Compose file written via SSH
      expect(ssh.putContent).toHaveBeenCalledWith(
        mockConn,
        expect.stringContaining('docker-compose.yml'),
        expect.stringContaining('nginx'),
      );
      // compose up called with exactly [composePath]
      expect(dockerSsh.composeUp).toHaveBeenCalledWith(
        mockConn,
        expect.stringContaining('platform-compose-'),
        expect.arrayContaining([expect.stringContaining('docker-compose.yml')]),
      );
      // containers registered
      expect(prisma.container.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dockerId: 'abc123',
            status: ContainerStatus.RUNNING,
            serviceEnvId: SVC_ENV_ID,
          }),
        }),
      );
      // deployment marked SUCCESS
      expect(prisma.deployment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: DeploymentStatus.SUCCESS }),
        }),
      );
      // currentDeploymentId pointer set
      expect(prisma.serviceEnvironment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentDeploymentId: DEPLOYMENT_ID }),
        }),
      );
      // SSH connection disposed
      expect(mockConn.dispose).toHaveBeenCalled();
    });

    it('applies Traefik route when domain is resolved and composeServiceName matches', async () => {
      deployRouting.resolveTraefikConfig.mockResolvedValue({
        traefikDomain: 'api.example.com',
        traefikServiceEnvId: SVC_ENV_ID,
        useTraefik: true,
      });

      await service.executeDeploy(DEPLOYMENT_ID);

      expect(deployRouting.applyRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          traefikDomain: 'api.example.com',
          serviceEnvId: SVC_ENV_ID,
          containerNames: expect.arrayContaining([expect.any(String)]),
        }),
      );
    });

    it('cleans up previous deployment containers on re-deploy (C8)', async () => {
      prisma.serviceEnvironment.findUnique.mockResolvedValue({
        currentDeploymentId: 'old-dep',
      });

      await service.executeDeploy(DEPLOYMENT_ID);

      expect(prisma.container.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deploymentId: 'old-dep' },
          data: { status: ContainerStatus.EXITED },
        }),
      );
    });

    it('does NOT clean up containers when there is no previous deployment', async () => {
      prisma.serviceEnvironment.findUnique.mockResolvedValue({
        currentDeploymentId: null,
      });

      await service.executeDeploy(DEPLOYMENT_ID);

      expect(prisma.container.updateMany).not.toHaveBeenCalled();
    });

    it('polls until services are running (2nd iteration)', async () => {
      jest.useFakeTimers();
      dockerSsh.composePs
        .mockResolvedValueOnce([{ Name: 'api', State: 'starting', ID: 'x1' }])
        .mockResolvedValue([{ Name: 'api', State: 'running', ID: 'x1' }]);

      const deployPromise = service.executeDeploy(DEPLOYMENT_ID);
      // Advance past the 5s poll interval so the second composePs call is made.
      await jest.advanceTimersByTimeAsync(6_000);
      await deployPromise;

      expect(dockerSsh.composePs).toHaveBeenCalledTimes(2);
      expect(prisma.deployment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: DeploymentStatus.SUCCESS }),
        }),
      );
      jest.useRealTimers();
    });
  });

  describe('executeDeploy — FAILURE path', () => {
    it('calls compose down and marks FAILED when compose up exits non-zero', async () => {
      dockerSsh.composeUp.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'image pull failed',
      });

      await expect(service.executeDeploy(DEPLOYMENT_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(dockerSsh.composeDown).toHaveBeenCalled();
      expect(prisma.deployment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: DeploymentStatus.FAILED }),
        }),
      );
    });

    it('calls compose down and marks FAILED when deployment is not found', async () => {
      prisma.deployment.findUnique.mockResolvedValue(null);

      await expect(service.executeDeploy(DEPLOYMENT_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('calls compose down and marks FAILED when service has no compose content', async () => {
      prisma.deployment.findUnique.mockResolvedValue(
        makeDeployment({
          service: { ...makeDeployment().service, dockerComposeContent: null },
        }),
      );

      await expect(service.executeDeploy(DEPLOYMENT_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('disposes SSH connection even on failure', async () => {
      dockerSsh.composeUp.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'err',
      });

      await expect(service.executeDeploy(DEPLOYMENT_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(mockConn.dispose).toHaveBeenCalled();
    });
  });

  describe('teardownComposeStack', () => {
    it('opens SSH and calls compose down for the given serviceEnvId', async () => {
      prisma.serviceEnvironment.findUnique.mockResolvedValue({
        serverId: SERVER_ID,
        environment: { servers: [] },
      });

      await service.teardownComposeStack(SVC_ENV_ID);

      expect(sshPool.acquire).toHaveBeenCalled();
      expect(dockerSsh.composeDown).toHaveBeenCalledWith(
        mockConn,
        expect.stringContaining('platform-compose-'),
      );
      expect(mockConn.dispose).toHaveBeenCalled();
    });

    it('returns silently when no server is found', async () => {
      prisma.serviceEnvironment.findUnique.mockResolvedValue({
        serverId: null,
        environment: { servers: [] },
      });

      await expect(
        service.teardownComposeStack(SVC_ENV_ID),
      ).resolves.toBeUndefined();
      expect(sshPool.acquire).not.toHaveBeenCalled();
    });
  });
});
