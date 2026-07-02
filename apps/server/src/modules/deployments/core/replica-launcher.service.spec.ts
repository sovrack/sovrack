import { ReplicaLauncherService } from './replica-launcher.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DeploymentPrelaunchService } from './deployment-prelaunch.service';
import { DeploymentLogEmitter } from './deployment-log-emitter.service';

// Extracted from DockerDeployExecutorService — see
// EXPLORATION_BACKEND_DEPENDANCES.md section 3. Behaviour itself was already
// covered indirectly through the e2e suite (real executeDeploy() runs); this
// spec adds direct unit coverage now that the logic is independently
// injectable.
describe('ReplicaLauncherService.launchReplicas', () => {
  function harness() {
    const docker = {
      createContainer: jest
        .fn()
        .mockResolvedValue({ id: 'container-id-123456789' }),
      startContainer: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      container: { create: jest.fn().mockResolvedValue({}) },
    };
    const prelaunch = {
      runHealthGate: jest.fn().mockResolvedValue('health OK\n'),
    };
    const logEmitter = { emit: jest.fn() };
    const service = new ReplicaLauncherService(
      docker as unknown as DockerApiService,
      prisma as unknown as PrismaService,
      prelaunch as unknown as DeploymentPrelaunchService,
      logEmitter as unknown as DeploymentLogEmitter,
    );
    return { service, docker, prisma, prelaunch, logEmitter };
  }

  const baseParams = () => ({
    serverId: 'srv-1',
    server: { host: '10.0.0.1' },
    deploymentId: 'dep-1',
    serviceId: 'svc-1',
    serviceEnvId: 'se-1',
    serviceType: 'APPLICATION' as never,
    containerName: 'app-dep1',
    serviceAlias: 'app',
    replicas: 1,
    imageRef: 'app:latest',
    runtime: {
      port: 3000,
      startCommand: null,
      healthcheckPath: null,
      cpuLimit: null,
      memLimitMb: null,
      replicas: 1,
    },
    envVars: [],
    servicePort: 3000,
    publishPort: 3000,
    useTraefik: false,
    platformLabels: {},
    dbVolumeName: null,
    dbVolumePath: null,
    appBinds: [],
    projectNetwork: 'project-p1',
    stopTimeout: 30,
    newContainerIds: [] as string[],
  });

  it('creates, starts and health-checks a single replica, recording it in Prisma', async () => {
    const { service, docker, prisma, prelaunch } = harness();
    const params = baseParams();

    const result = await service.launchReplicas(params);

    expect(docker.createContainer).toHaveBeenCalledTimes(1);
    expect(docker.startContainer).toHaveBeenCalledWith(
      'srv-1',
      'container-id-123456789',
    );
    expect(prisma.container.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dockerId: 'container-id-123456789',
          deploymentId: 'dep-1',
          serverId: 'srv-1',
        }),
      }),
    );
    expect(prelaunch.runHealthGate).toHaveBeenCalledTimes(1);
    expect(result.replicaContainerNames).toEqual(['app-dep1']);
    // Pass-by-reference: newContainerIds is populated for the caller's
    // failure-cleanup path.
    expect(params.newContainerIds).toEqual(['container-id-123456789']);
  });

  it('launches N replicas with distinct suffixed names/aliases', async () => {
    const { service, docker } = harness();
    docker.createContainer
      .mockResolvedValueOnce({ id: 'c1' })
      .mockResolvedValueOnce({ id: 'c2' })
      .mockResolvedValueOnce({ id: 'c3' });
    const params = { ...baseParams(), replicas: 3 };

    const result = await service.launchReplicas(params);

    expect(result.replicaContainerNames).toEqual([
      'app-dep1-1',
      'app-dep1-2',
      'app-dep1-3',
    ]);
    expect(params.newContainerIds).toEqual(['c1', 'c2', 'c3']);
  });

  it('propagates a health-gate failure without registering later replicas', async () => {
    const { service, prelaunch } = harness();
    prelaunch.runHealthGate.mockRejectedValueOnce(new Error('unhealthy'));
    const params = { ...baseParams(), replicas: 2 };

    await expect(service.launchReplicas(params)).rejects.toThrow('unhealthy');
    // First replica's container id was still tracked before the failure.
    expect(params.newContainerIds).toHaveLength(1);
  });
});
