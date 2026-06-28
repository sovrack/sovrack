import { BadRequestException } from '@nestjs/common';
import { ContainerStatus, DeploymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { AuditService } from '../../audit/audit.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { DeploymentsAuthorizationService } from '../query/deployments-authorization.service';
import { DeploymentsQueryService } from '../query/deployments-query.service';
import { DeploymentsLifecycleService } from './deployments-lifecycle.service';

describe('DeploymentsLifecycleService', () => {
  let prisma: {
    deployment: { updateMany: jest.Mock; update: jest.Mock; delete: jest.Mock };
    container: { findMany: jest.Mock; updateMany: jest.Mock };
  };
  let docker: { stopContainer: jest.Mock };
  let gateway: { emitStatus: jest.Mock };
  let auth: { assertCanDeployProject: jest.Mock };
  let query: { findOne: jest.Mock };
  let audit: { record: jest.Mock };
  let service: DeploymentsLifecycleService;

  beforeEach(() => {
    prisma = {
      deployment: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'd1',
            projectId: 'p1',
            environmentId: 'e1',
            ...data,
          }),
        ),
        delete: jest.fn().mockResolvedValue({}),
      },
      container: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'c1', dockerId: 'dock1', serverId: 's1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
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
      }),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new DeploymentsLifecycleService(
      prisma as unknown as PrismaService,
      docker as unknown as DockerApiService,
      gateway as unknown as DeploymentEventsPublisher,
      auth as unknown as DeploymentsAuthorizationService,
      query as unknown as DeploymentsQueryService,
      audit as unknown as AuditService,
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
});
