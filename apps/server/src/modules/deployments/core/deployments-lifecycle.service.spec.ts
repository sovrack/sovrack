import { BadRequestException } from '@nestjs/common';
import {
  BuildPack,
  ContainerStatus,
  DeploymentStatus,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { AuditService } from '../../audit/audit.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { DeploymentsAuthorizationService } from '../query/deployments-authorization.service';
import { DeploymentsQueryService } from '../query/deployments-query.service';
import { DeploymentsLifecycleService } from './deployments-lifecycle.service';
import { DockerComposeExecutorService } from './docker-compose-executor.service';

describe('DeploymentsLifecycleService', () => {
  let prisma: {
    deployment: {
      updateMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
    };
    container: { findMany: jest.Mock; updateMany: jest.Mock };
    serviceEnvironment: { findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let docker: { stopContainer: jest.Mock };
  let gateway: { emitStatus: jest.Mock };
  let auth: { assertCanDeployProject: jest.Mock };
  let query: { findOne: jest.Mock };
  let audit: { record: jest.Mock };
  let composeExecutor: { teardownComposeStack: jest.Mock };
  let service: DeploymentsLifecycleService;

  beforeEach(() => {
    prisma = {
      deployment: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              id: 'd1',
              projectId: 'p1',
              environmentId: 'e1',
              serviceEnvId: null,
              ...data,
            }),
          ),
        delete: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      container: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'c1', dockerId: 'dock1', serverId: 's1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      serviceEnvironment: {
        findUnique: jest.fn().mockResolvedValue({ currentDeploymentId: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      // $transaction est mocké pour exécuter le callback avec ce même mock en
      // guise de `tx` — suffisant en test unitaire, l'atomicité réelle est
      // garantie par Prisma en production, pas testable via ce mock.
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    docker = { stopContainer: jest.fn().mockResolvedValue(undefined) };
    gateway = { emitStatus: jest.fn() };
    auth = { assertCanDeployProject: jest.fn().mockResolvedValue(undefined) };
    query = {
      findOne: jest.fn().mockResolvedValue({
        id: 'd1',
        projectId: 'p1',
        environmentId: 'e1',
        status: DeploymentStatus.RUNNING,
        logs: '',
        service: null,
        serviceEnvId: null,
      }),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    composeExecutor = {
      teardownComposeStack: jest.fn().mockResolvedValue(undefined),
    };
    service = new DeploymentsLifecycleService(
      prisma as unknown as PrismaService,
      docker as unknown as DockerApiService,
      gateway as unknown as DeploymentEventsPublisher,
      auth as unknown as DeploymentsAuthorizationService,
      query as unknown as DeploymentsQueryService,
      audit as unknown as AuditService,
      composeExecutor as unknown as DockerComposeExecutorService,
    );
  });

  it('recovers in-flight deployments after a restart (marks them FAILED)', async () => {
    const n = await service.recoverInFlightDeploymentsAfterRestart();
    expect(n).toBe(2);
    expect(prisma.deployment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DeploymentStatus.FAILED }),
      }),
    );
  });

  it('cancels a RUNNING deployment: stops containers, sets CANCELED, audits', async () => {
    const res = await service.cancel('d1', 'u1', Role.ADMIN);
    expect(docker.stopContainer).toHaveBeenCalledWith('s1', 'dock1');
    expect(res.status).toBe(DeploymentStatus.CANCELED);
    expect(prisma.container.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: ContainerStatus.EXITED } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      'u1',
      'DEPLOYMENT_CANCEL',
      'Deployment',
      'd1',
      expect.anything(),
    );
  });

  it('refuses to cancel a finished deployment', async () => {
    query.findOne.mockResolvedValue({
      id: 'd1',
      projectId: 'p1',
      status: DeploymentStatus.SUCCESS,
    });
    await expect(service.cancel('d1', 'u1', Role.ADMIN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.deployment.update).not.toHaveBeenCalled();
  });

  it('does not fail cancel when stopping a container errors', async () => {
    docker.stopContainer.mockRejectedValue(new Error('docker down'));
    await expect(service.cancel('d1', 'u1', Role.ADMIN)).resolves.toMatchObject(
      {
        status: DeploymentStatus.CANCELED,
      },
    );
  });

  it('removes a deployment: stops containers, deletes, audits', async () => {
    await service.remove('d1', 'u1', Role.ADMIN);
    expect(docker.stopContainer).toHaveBeenCalled();
    expect(prisma.deployment.delete).toHaveBeenCalledWith({
      where: { id: 'd1' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      'u1',
      'DEPLOYMENT_DELETE',
      'Deployment',
      'd1',
      expect.anything(),
    );
  });

  describe('cancel — currentDeploymentId pointer reset (C11)', () => {
    it('resets currentDeploymentId to last SUCCESS when the canceled deployment was the live pointer', async () => {
      const SVC_ENV_ID = 'svcenv-1';
      query.findOne.mockResolvedValue({
        id: 'd1',
        projectId: 'p1',
        environmentId: 'e1',
        status: DeploymentStatus.RUNNING,
        logs: '',
        service: null,
        serviceEnvId: SVC_ENV_ID,
      });
      // The deployment update echoes back serviceEnvId so the cancel logic can check it.
      prisma.deployment.update.mockResolvedValue({
        id: 'd1',
        projectId: 'p1',
        environmentId: 'e1',
        serviceEnvId: SVC_ENV_ID,
        status: DeploymentStatus.CANCELED,
      });
      // currentDeploymentId currently points to 'd1' (the deployment being canceled).
      prisma.serviceEnvironment.findUnique.mockResolvedValue({
        currentDeploymentId: 'd1',
      });
      // Last SUCCESS before 'd1' is 'd0'.
      prisma.deployment.findFirst.mockResolvedValue({ id: 'd0' });

      await service.cancel('d1', 'u1', Role.ADMIN);

      expect(prisma.serviceEnvironment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SVC_ENV_ID },
          data: { currentDeploymentId: 'd0' },
        }),
      );
    });

    it('sets currentDeploymentId to null when no previous SUCCESS exists', async () => {
      const SVC_ENV_ID = 'svcenv-1';
      query.findOne.mockResolvedValue({
        id: 'd1',
        projectId: 'p1',
        environmentId: 'e1',
        status: DeploymentStatus.RUNNING,
        logs: '',
        service: null,
        serviceEnvId: SVC_ENV_ID,
      });
      prisma.deployment.update.mockResolvedValue({
        id: 'd1',
        projectId: 'p1',
        environmentId: 'e1',
        serviceEnvId: SVC_ENV_ID,
        status: DeploymentStatus.CANCELED,
      });
      prisma.serviceEnvironment.findUnique.mockResolvedValue({
        currentDeploymentId: 'd1',
      });
      prisma.deployment.findFirst.mockResolvedValue(null); // no previous SUCCESS

      await service.cancel('d1', 'u1', Role.ADMIN);

      expect(prisma.serviceEnvironment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { currentDeploymentId: null },
        }),
      );
    });

    it('does not touch serviceEnvironment when canceled deployment was not the live pointer', async () => {
      const SVC_ENV_ID = 'svcenv-1';
      query.findOne.mockResolvedValue({
        id: 'd1',
        projectId: 'p1',
        environmentId: 'e1',
        status: DeploymentStatus.RUNNING,
        logs: '',
        service: null,
        serviceEnvId: SVC_ENV_ID,
      });
      prisma.deployment.update.mockResolvedValue({
        id: 'd1',
        projectId: 'p1',
        environmentId: 'e1',
        serviceEnvId: SVC_ENV_ID,
        status: DeploymentStatus.CANCELED,
      });
      // currentDeploymentId points to a DIFFERENT deployment ('d-other')
      prisma.serviceEnvironment.findUnique.mockResolvedValue({
        currentDeploymentId: 'd-other',
      });

      await service.cancel('d1', 'u1', Role.ADMIN);

      // serviceEnvironment.update should NOT be called to reset the pointer
      expect(prisma.serviceEnvironment.update).not.toHaveBeenCalled();
    });
  });

  describe('cancel — compose-aware teardown (C6)', () => {
    it('calls teardownComposeStack instead of stopContainer for DOCKER_COMPOSE deployments', async () => {
      const SVC_ENV_ID = 'svcenv-2';
      query.findOne.mockResolvedValue({
        id: 'd1',
        projectId: 'p1',
        environmentId: 'e1',
        status: DeploymentStatus.RUNNING,
        logs: '',
        service: { buildPack: BuildPack.DOCKER_COMPOSE },
        serviceEnvId: SVC_ENV_ID,
      });
      prisma.deployment.update.mockResolvedValue({
        id: 'd1',
        projectId: 'p1',
        environmentId: 'e1',
        serviceEnvId: SVC_ENV_ID,
        status: DeploymentStatus.CANCELED,
      });

      await service.cancel('d1', 'u1', Role.ADMIN);

      expect(composeExecutor.teardownComposeStack).toHaveBeenCalledWith(
        SVC_ENV_ID,
      );
      expect(docker.stopContainer).not.toHaveBeenCalled();
    });

    it('uses individual stopContainer for non-compose deployments', async () => {
      await service.cancel('d1', 'u1', Role.ADMIN);

      expect(composeExecutor.teardownComposeStack).not.toHaveBeenCalled();
      expect(docker.stopContainer).toHaveBeenCalled();
    });
  });
});
