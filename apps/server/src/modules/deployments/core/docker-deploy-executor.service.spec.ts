import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DockerDeployExecutorService } from './docker-deploy-executor.service';
import {
  resolveRuntimeConfig,
  type RuntimeConfigInput,
} from './deployment-executor-utils';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DOCKER_RUNTIME } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DeployRoutingService } from './deploy-routing.service';
import { ContainerLifecycleService } from './container-lifecycle.service';
import { ImageResolverService } from './image-resolver.service';
import { DeploymentLogEmitter } from './deployment-log-emitter.service';
import { DeploymentEnvService } from './deployment-env.service';
import { DeploymentPrelaunchService } from './deployment-prelaunch.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { NotificationsService } from '../../notifications/notifications.service';
import { ReplicaLauncherService } from './replica-launcher.service';
import { DeployFailureRecoveryService } from './deploy-failure-recovery.service';

describe('DockerDeployExecutorService', () => {
  let service: DockerDeployExecutorService;

  const mockPrisma = () => ({
    deployment: { findUnique: jest.fn(), update: jest.fn() },
    server: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  });

  const mockDocker = () => ({
    createNetwork: jest.fn(),
    pruneDanglingImages: jest.fn(),
  });

  const mockNoop = () => ({
    emit: jest.fn(),
    emitStatus: jest.fn(),
    emitFinished: jest.fn(),
  });

  /** Build a module with defaults that either pass or can be overridden. */
  async function buildService(
    overrides?: Partial<{
      prisma: ReturnType<typeof mockPrisma>;
      docker: ReturnType<typeof mockDocker>;
    }>,
  ) {
    const prisma = overrides?.prisma ?? mockPrisma();
    const docker = overrides?.docker ?? mockDocker();

    const moduleRef = await Test.createTestingModule({
      providers: [
        DockerDeployExecutorService,
        { provide: PrismaService, useValue: prisma },
        { provide: DOCKER_RUNTIME, useValue: docker },
        { provide: DeploymentEventsPublisher, useValue: mockNoop() },
        { provide: DeploymentLogEmitter, useValue: { emit: jest.fn() } },
        {
          provide: DeploymentPrelaunchService,
          useValue: { runPreDeployCommand: jest.fn() },
        },
        {
          provide: ImageResolverService,
          useValue: {
            resolveImageRef: jest.fn(),
            buildOrPullImage: jest.fn(),
            resolveImageDigest: jest.fn(),
          },
        },
        {
          provide: DeploymentEnvService,
          useValue: {
            resolveAutoWiredDbEnv: jest.fn(),
            resolveDeploymentEnv: jest.fn(),
            setupDbVolume: jest.fn(),
          },
        },
        {
          provide: DeployRoutingService,
          useValue: {
            resolveTraefikConfig: jest.fn(),
            applyRoute: jest.fn(),
            cutoverBlueGreen: jest.fn(),
          },
        },
        {
          provide: ContainerLifecycleService,
          useValue: {
            assertNoForeignPortConflict: jest.fn(),
            listServiceContainers: jest.fn(),
            stopContainers: jest.fn(),
            removeContainers: jest.fn(),
          },
        },
        {
          provide: ReplicaLauncherService,
          useValue: { launchReplicas: jest.fn() },
        },
        {
          provide: DeployFailureRecoveryService,
          useValue: { handleDeployFailure: jest.fn() },
        },
        {
          provide: NotificationsService,
          useValue: { notifyDeploymentFinished: jest.fn() },
        },
      ],
    }).compile();

    return moduleRef.get(DockerDeployExecutorService);
  }

  // ─── resolveRuntimeConfig (pure function, no DI) ───────────────────────

  describe('resolveRuntimeConfig', () => {
    const snap: RuntimeConfigInput = {
      isRollback: false,
      isAutoHealed: false,
      specSnapshot: null,
      service: {
        port: 4000,
        startCommand: 'npm start',
        healthcheckPath: '/health',
        cpuLimit: 1,
        memLimitMb: 512,
        replicas: 2,
      },
    };

    it('uses live config for a normal deploy (no snapshot)', () => {
      const result = resolveRuntimeConfig(snap);
      expect(result).toEqual({
        port: 4000,
        startCommand: 'npm start',
        healthcheckPath: '/health',
        cpuLimit: 1,
        memLimitMb: 512,
        replicas: 2,
      });
    });

    it('falls back to defaults when service is null and no snapshot', () => {
      const result = resolveRuntimeConfig({ ...snap, service: null });
      expect(result).toEqual({
        port: 3000,
        startCommand: null,
        healthcheckPath: null,
        cpuLimit: null,
        memLimitMb: null,
        replicas: 1,
      });
    });

    it('prefers specSnapshot values during rollback', () => {
      const result = resolveRuntimeConfig({
        ...snap,
        isRollback: true,
        specSnapshot: { port: 5000, replicas: 3 },
      });
      expect(result.port).toBe(5000);
      expect(result.replicas).toBe(3);
      expect(result.startCommand).toBe('npm start');
    });

    it('prefers specSnapshot during auto-heal', () => {
      const result = resolveRuntimeConfig({
        ...snap,
        isAutoHealed: true,
        specSnapshot: { cpuLimit: 2, memLimitMb: 1024 },
      });
      expect(result.cpuLimit).toBe(2);
      expect(result.memLimitMb).toBe(1024);
    });

    it('ignores specSnapshot for a normal deploy even when present', () => {
      const result = resolveRuntimeConfig({
        ...snap,
        isRollback: false,
        isAutoHealed: false,
        specSnapshot: { port: 9999 },
      });
      expect(result.port).toBe(4000);
    });

    it('falls back to service value when snapshot field is null', () => {
      const result = resolveRuntimeConfig({
        ...snap,
        isRollback: true,
        specSnapshot: { port: null },
      });
      expect(result.port).toBe(4000);
    });

    it('ignores non-object specSnapshot (e.g. primitive)', () => {
      const result = resolveRuntimeConfig({
        ...snap,
        isRollback: true,
        specSnapshot: 'string-not-object',
      });
      expect(result.port).toBe(4000);
    });
  });

  // ─── executeDeploy — error paths ──────────────────────────────────────

  describe('executeDeploy', () => {
    it('throws NotFoundException when deployment is missing', async () => {
      const prisma = mockPrisma();
      prisma.deployment.findUnique.mockResolvedValue(null);
      service = await buildService({ prisma });

      await expect(service.executeDeploy('evt_missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects Compose deployments', async () => {
      const prisma = mockPrisma();
      prisma.deployment.findUnique.mockResolvedValue({
        id: 'd_1',
        service: { buildPack: 'DOCKER_COMPOSE' },
      });
      service = await buildService({ prisma });

      await expect(service.executeDeploy('d_1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects deployments without serviceEnvId', async () => {
      const prisma = mockPrisma();
      prisma.deployment.findUnique.mockResolvedValue({
        id: 'd_1',
        project: { id: 'proj_1', name: 'Test' },
        service: { buildPack: null, type: 'APPLICATION' },
        serviceEnvId: null,
      });
      service = await buildService({ prisma });

      await expect(service.executeDeploy('d_1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
