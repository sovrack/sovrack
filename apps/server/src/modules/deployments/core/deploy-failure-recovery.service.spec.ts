import { BadRequestException } from '@nestjs/common';
import { DeploymentStatus } from '@prisma/client';
import { DeployFailureRecoveryService } from './deploy-failure-recovery.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { ContainerLifecycleService } from './container-lifecycle.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { NotificationsService } from '../../notifications/notifications.service';

// Extracted from DockerDeployExecutorService — see
// EXPLORATION_BACKEND_DEPENDANCES.md section 3.
describe('DeployFailureRecoveryService.handleDeployFailure', () => {
  function harness() {
    const docker = {
      removeContainer: jest.fn().mockResolvedValue(undefined),
    };
    const containerLifecycle = {
      restartContainers: jest.fn().mockResolvedValue('restarted\n'),
    };
    const prisma = {
      deployment: {
        update: jest.fn().mockResolvedValue({
          id: 'dep-1',
          status: DeploymentStatus.FAILED,
          finishedAt: new Date(),
        }),
      },
    };
    const gateway = { emitStatus: jest.fn(), emitFinished: jest.fn() };
    const notifications = {
      notifyDeploymentFinished: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DeployFailureRecoveryService(
      docker as unknown as DockerApiService,
      containerLifecycle as unknown as ContainerLifecycleService,
      prisma as unknown as PrismaService,
      gateway as unknown as DeploymentEventsPublisher,
      notifications as unknown as NotificationsService,
    );
    return {
      service,
      docker,
      containerLifecycle,
      prisma,
      gateway,
      notifications,
    };
  }

  const baseParams = (over: Record<string, unknown> = {}) => ({
    serverId: 'srv-1',
    deploymentId: 'dep-1',
    priorLogs: 'old logs',
    commandLogs: 'partial logs',
    newContainerIds: ['c1', 'c2'],
    stoppedOld: [{ id: 'old1', name: 'app-old' }],
    projectName: 'proj',
    environmentName: 'prod',
    branch: 'main',
    triggeredBy: 'user@example.com',
    error: new Error('boom'),
    ...over,
  });

  it('removes half-deployed containers and restarts the stopped old ones', async () => {
    const { service, docker, containerLifecycle } = harness();
    await expect(service.handleDeployFailure(baseParams())).rejects.toThrow();

    expect(docker.removeContainer).toHaveBeenCalledWith('srv-1', 'c1', true);
    expect(docker.removeContainer).toHaveBeenCalledWith('srv-1', 'c2', true);
    expect(containerLifecycle.restartContainers).toHaveBeenCalledWith(
      'srv-1',
      [{ id: 'old1', name: 'app-old' }],
      'dep-1',
    );
  });

  it('marks the deployment FAILED with the error message in conditions and logs', async () => {
    const { service, prisma } = harness();
    await expect(
      service.handleDeployFailure(
        baseParams({ error: new Error('specific reason') }),
      ),
    ).rejects.toThrow();

    const call = prisma.deployment.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'dep-1' });
    expect(call.data.status).toBe(DeploymentStatus.FAILED);
    expect(call.data.logs).toContain('specific reason');
    expect(call.data.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'Degraded',
          reason: 'DeployFailed',
          message: 'specific reason',
        }),
      ]),
    );
  });

  it('re-throws the original BadRequestException as-is', async () => {
    const { service } = harness();
    const original = new BadRequestException('specific bad request');
    await expect(
      service.handleDeployFailure(baseParams({ error: original })),
    ).rejects.toBe(original);
  });

  it('wraps a non-BadRequestException error in a generic BadRequestException', async () => {
    const { service } = harness();
    await expect(
      service.handleDeployFailure(baseParams({ error: new Error('boom') })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('emits status/finished events and a FAILED notification', async () => {
    const { service, gateway, notifications } = harness();
    await expect(service.handleDeployFailure(baseParams())).rejects.toThrow();

    expect(gateway.emitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: 'dep-1',
        status: DeploymentStatus.FAILED,
      }),
    );
    expect(gateway.emitFinished).toHaveBeenCalled();
    expect(notifications.notifyDeploymentFinished).toHaveBeenCalledWith(
      expect.objectContaining({ deploymentId: 'dep-1', status: 'FAILED' }),
    );
  });
});
