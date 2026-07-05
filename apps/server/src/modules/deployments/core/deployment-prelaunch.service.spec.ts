import { BadRequestException } from '@nestjs/common';
import { ContainerStatus } from '@prisma/client';
import { DeploymentPrelaunchService } from './deployment-prelaunch.service';

function makeSvc(
  opts: {
    inspectStates?: Array<{
      Status: string;
      ExitCode?: number;
      RestartCount?: number;
    }>;
    inspectError?: boolean;
    healthcheckLogs?: string;
    healthcheckError?: Error;
    stopError?: boolean;
  } = {},
) {
  const inspectStates = opts.inspectStates ?? [
    { Status: 'exited', ExitCode: 0 },
  ];
  let inspectCall = 0;

  const docker = {
    createContainer: jest.fn().mockResolvedValue({ id: 'pre-container-1' }),
    startContainer: jest.fn().mockResolvedValue(undefined),
    inspectContainer: jest.fn().mockImplementation(() => {
      if (opts.inspectError) return Promise.reject(new Error('inspect failed'));
      const state =
        inspectStates[inspectCall] ?? inspectStates[inspectStates.length - 1];
      inspectCall++;
      // RestartCount vit au niveau racine de ContainerInspectInfo (D7).
      return Promise.resolve({
        State: { Status: state.Status, ExitCode: state.ExitCode },
        RestartCount: state.RestartCount ?? 0,
      });
    }),
    stopContainer: opts.stopError
      ? jest.fn().mockRejectedValue(new Error('stop failed'))
      : jest.fn().mockResolvedValue(undefined),
  } as never;

  const healthcheck = {
    runPostDeployHealthChecks: opts.healthcheckError
      ? jest.fn().mockRejectedValue(opts.healthcheckError)
      : jest.fn().mockResolvedValue(opts.healthcheckLogs ?? 'health OK'),
  } as never;

  const logEmitter = {
    emit: jest.fn(),
  } as never;

  const prisma = {
    container: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as never;

  const svc = new DeploymentPrelaunchService(
    prisma,
    docker,
    healthcheck,
    logEmitter,
  );
  // Les fenêtres d'attente (anti-flap, stabilité D7) sont neutralisées pour
  // que les tests soient instantanés — on teste la LOGIQUE, pas les délais.
  jest
    .spyOn(svc as unknown as { sleep: () => Promise<void> }, 'sleep')
    .mockResolvedValue(undefined);

  return { svc, docker, healthcheck, logEmitter, prisma };
}

describe('DeploymentPrelaunchService', () => {
  describe('runPreDeployCommand', () => {
    it('creates, starts, and inspects a throwaway container', async () => {
      const { svc, docker } = makeSvc();
      await svc.runPreDeployCommand(
        'srv1',
        'my-image:latest',
        'app',
        [],
        'npm run migrate',
        60,
        'dep1',
      );
      expect(docker.createContainer).toHaveBeenCalledWith(
        'srv1',
        expect.objectContaining({
          Image: 'my-image:latest',
          name: 'pre-app',
          Cmd: ['sh', '-c', 'npm run migrate'],
          HostConfig: { AutoRemove: true },
        }),
      );
      expect(docker.startContainer).toHaveBeenCalledWith(
        'srv1',
        'pre-container-1',
      );
    });

    it('returns success message when exit code is 0', async () => {
      const { svc } = makeSvc({
        inspectStates: [{ Status: 'exited', ExitCode: 0 }],
      });
      const result = await svc.runPreDeployCommand(
        'srv1',
        'img',
        'ctn',
        [],
        'echo ok',
        10,
        'dep1',
      );
      expect(result).toContain('Completed successfully');
    });

    it('throws BadRequestException when exit code is non-zero', async () => {
      const { svc } = makeSvc({
        inspectStates: [{ Status: 'exited', ExitCode: 1 }],
      });
      await expect(
        svc.runPreDeployCommand('srv1', 'img', 'ctn', [], 'exit 1', 10, 'dep1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns exit code -1 when inspect throws', async () => {
      const { svc } = makeSvc({ inspectError: true });
      await expect(
        svc.runPreDeployCommand('srv1', 'img', 'ctn', [], 'cmd', 10, 'dep1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('emits PRE-DEPLOY log at start', async () => {
      const { svc, logEmitter } = makeSvc();
      await svc.runPreDeployCommand(
        'srv1',
        'img',
        'ctn',
        [],
        'my-cmd',
        10,
        'dep-123',
      );
      expect(logEmitter.emit).toHaveBeenCalledWith(
        'dep-123',
        expect.stringContaining('[PRE-DEPLOY]'),
        'info',
      );
    });

    it('passes env vars to the container', async () => {
      const { svc, docker } = makeSvc();
      await svc.runPreDeployCommand(
        'srv1',
        'img',
        'ctn',
        ['DB_URL=postgres://...'],
        'cmd',
        10,
        'd1',
      );
      expect(docker.createContainer).toHaveBeenCalledWith(
        'srv1',
        expect.objectContaining({
          Env: ['DB_URL=postgres://...'],
        }),
      );
    });
  });

  describe('runHealthGate', () => {
    const baseParams = {
      serverId: 'srv1',
      containerId: 'ctn1',
      serverHost: '1.2.3.4',
      publishPort: 3000,
      useTraefik: false,
      healthcheckPath: '/health',
      deploymentId: 'dep1',
    };

    it('runs post-deploy health checks in non-Traefik mode', async () => {
      // Après la sonde HTTP, la stabilité D7 ré-inspecte : conteneur running.
      const { svc, healthcheck } = makeSvc({
        inspectStates: [{ Status: 'running', RestartCount: 0 }],
      });
      const result = await svc.runHealthGate({ ...baseParams });
      expect(healthcheck.runPostDeployHealthChecks).toHaveBeenCalledWith(
        expect.objectContaining({
          serverId: 'srv1',
          appPort: 3000,
          healthcheckPath: '/health',
        }),
      );
      expect(result).toContain('health OK');
    });

    it('returns Traefik mode message without running healthchecks (stable)', async () => {
      const { svc, healthcheck } = makeSvc({
        inspectStates: [{ Status: 'running', RestartCount: 0 }],
      });
      const result = await svc.runHealthGate({
        ...baseParams,
        useTraefik: true,
      });
      expect(healthcheck.runPostDeployHealthChecks).not.toHaveBeenCalled();
      expect(result).toContain('Traefik');
    });

    it('throws BadRequestException in Traefik mode when container is not running', async () => {
      const { svc } = makeSvc({ inspectStates: [{ Status: 'exited' }] });
      await expect(
        svc.runHealthGate({ ...baseParams, useTraefik: true }),
      ).rejects.toThrow(BadRequestException);
    });

    // D7 (mission finale) : un conteneur qui crash-loope APRÈS le démarrage
    // (RestartCount qui augmente sur la fenêtre) ne doit PLUS être SUCCESS.
    it('rejects a crash-looping container (RestartCount increases) — Traefik/DB path', async () => {
      const { svc, docker } = makeSvc({
        inspectStates: [
          { Status: 'running', RestartCount: 0 },
          { Status: 'running', RestartCount: 1 },
          { Status: 'running', RestartCount: 3 },
        ],
      });
      await expect(
        svc.runHealthGate({ ...baseParams, dbHostPortDisabled: true }),
      ).rejects.toThrow(/crash-loop/);
      expect(docker.stopContainer).toHaveBeenCalledWith('srv1', 'ctn1');
    });

    it('rejects when the container is no longer running during the stability window', async () => {
      const { svc } = makeSvc({
        inspectStates: [
          { Status: 'running', RestartCount: 0 },
          { Status: 'exited', RestartCount: 0 },
        ],
      });
      await expect(
        svc.runHealthGate({ ...baseParams, dbHostPortDisabled: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a container that stays running with a stable RestartCount', async () => {
      const { svc } = makeSvc({
        inspectStates: [{ Status: 'running', RestartCount: 2 }],
      });
      const result = await svc.runHealthGate({
        ...baseParams,
        dbHostPortDisabled: true,
      });
      expect(result).toContain('stable');
    });

    it('stops unhealthy container and rethrows when healthcheck fails', async () => {
      const healthError = new BadRequestException('health check failed');
      const { svc, docker } = makeSvc({ healthcheckError: healthError });
      await expect(svc.runHealthGate({ ...baseParams })).rejects.toThrow(
        'health check failed',
      );
      expect(docker.stopContainer).toHaveBeenCalledWith('srv1', 'ctn1');
    });

    it('marks container EXITED in DB after health failure', async () => {
      const { svc, prisma } = makeSvc({
        healthcheckError: new BadRequestException('fail'),
      });
      await expect(svc.runHealthGate({ ...baseParams })).rejects.toThrow();
      expect(prisma.container.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: ContainerStatus.EXITED } }),
      );
    });

    it('does not throw when stopContainer fails during health-gate error handling', async () => {
      const { svc } = makeSvc({
        healthcheckError: new BadRequestException('fail'),
        stopError: true,
      });
      await expect(svc.runHealthGate({ ...baseParams })).rejects.toThrow(
        'fail',
      );
    });

    it('emits error log when healthcheck fails', async () => {
      const { svc, logEmitter } = makeSvc({
        healthcheckError: new BadRequestException('fail'),
      });
      await expect(svc.runHealthGate({ ...baseParams })).rejects.toThrow();
      expect(logEmitter.emit).toHaveBeenCalledWith(
        'dep1',
        expect.stringContaining('Health-check'),
        'error',
      );
    });
  });
});
