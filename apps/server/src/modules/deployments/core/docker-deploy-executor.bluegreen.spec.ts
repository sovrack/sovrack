import { ContainerStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { DeployRoutingService } from './deploy-routing.service';
import { TraefikRouteService } from './traefik-route.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';

/**
 * Unit coverage for the blue-green cut-over helper. The full executeDeploy path
 * is exercised end-to-end by the deployments e2e suite (STANDARD strategy); here
 * we isolate the cut-over: repoint proxy → drain → retire blue.
 */
describe('DeployRoutingService — blue-green cut-over', () => {
  function build() {
    const prisma = {
      proxyRule: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      container: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'c-blue', dockerId: 'docker-blue', name: 'app-blue' },
          ]),
        update: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;
    const docker = {
      removeContainer: jest.fn().mockResolvedValue(undefined),
    } as unknown as DockerApiService;
    const routing = new DeployRoutingService(
      prisma,
      {} as unknown as TraefikRouteService,
      docker,
      {} as unknown as DeploymentEventsPublisher,
    );
    // Skip the real 3s drain.
    jest
      .spyOn(routing as unknown as { sleep: () => Promise<void> }, 'sleep')
      .mockResolvedValue(undefined);
    return { routing, prisma, docker };
  }

  it('repoints proxy to the green port, drains, then removes blue', async () => {
    const { routing, prisma, docker } = build();
    const logs = await routing.cutoverBlueGreen({
      serviceEnvId: 'env-1',
      serverId: 'srv-1',
      greenDockerId: 'docker-green',
      publishPort: 3001,
    });

    expect(prisma.proxyRule.updateMany).toHaveBeenCalledWith({
      where: { serviceEnvId: 'env-1', serverId: 'srv-1' },
      data: { targetPort: 3001 },
    });
    expect(prisma.container.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          serviceEnvId: 'env-1',
          status: ContainerStatus.RUNNING,
          dockerId: { not: 'docker-green' },
        },
      }),
    );
    expect(docker.removeContainer).toHaveBeenCalledWith(
      'srv-1',
      'docker-blue',
      true,
    );
    expect(prisma.container.update).toHaveBeenCalledWith({
      where: { id: 'c-blue' },
      data: { status: ContainerStatus.EXITED },
    });
    expect(logs).toContain('[BLUE-GREEN]');
  });

  it('is a no-op when there is no service-environment', async () => {
    const { routing, prisma } = build();
    const logs = await routing.cutoverBlueGreen({
      serviceEnvId: null,
      serverId: 'srv-1',
      greenDockerId: 'docker-green',
      publishPort: 3001,
    });
    expect(prisma.proxyRule.updateMany).not.toHaveBeenCalled();
    expect(logs).toContain('cut-over ignoré');
  });

  it('does not crash if removing a blue container fails', async () => {
    const { routing, docker } = build();
    (docker.removeContainer as jest.Mock).mockRejectedValueOnce(
      new Error('boom'),
    );
    await expect(
      routing.cutoverBlueGreen({
        serviceEnvId: 'env-1',
        serverId: 'srv-1',
        greenDockerId: 'docker-green',
        publishPort: 3001,
      }),
    ).resolves.toBeDefined();
  });
});
