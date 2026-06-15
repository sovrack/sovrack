import { ContainerStatus } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { DockerApiService } from '../../../core/container-runtime/docker-api.service';
import { DeploymentsGateway } from '../gateways/deployments.gateway';
import { DeploymentsHealthcheckService } from '../health/deployments-healthcheck.service';
import { DockerDeployExecutorService } from './docker-deploy-executor.service';

/**
 * Unit coverage for the blue-green cut-over helper. The full executeDeploy path
 * is exercised end-to-end by the deployments e2e suite (STANDARD strategy); here
 * we isolate the cut-over: repoint proxy → drain → retire blue.
 */
describe('DockerDeployExecutorService — blue-green cut-over', () => {
  function build() {
    const prisma = {
      proxyRule: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      container: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c-blue', dockerId: 'docker-blue', name: 'app-blue' },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;
    const docker = { removeContainer: jest.fn().mockResolvedValue(undefined) } as unknown as DockerApiService;
    const service = new DockerDeployExecutorService(
      prisma,
      docker,
      {} as DeploymentsGateway,
      {} as DeploymentsHealthcheckService,
    );
    // Skip the real 3s drain.
    jest.spyOn(service as unknown as { sleep: () => Promise<void> }, 'sleep').mockResolvedValue(undefined);
    return { service, prisma, docker };
  }

  const cutover = (s: DockerDeployExecutorService, ...args: unknown[]) =>
    (s as unknown as { cutoverBlueGreen: (...a: unknown[]) => Promise<string> }).cutoverBlueGreen(...args);

  it('repoints proxy to the green port, drains, then removes blue', async () => {
    const { service, prisma, docker } = build();
    const logs = await cutover(service, 'env-1', 'srv-1', 'docker-green', 3001);

    expect(prisma.proxyRule.updateMany).toHaveBeenCalledWith({
      where: { serviceEnvId: 'env-1', serverId: 'srv-1' },
      data: { targetPort: 3001 },
    });
    // Blue is selected by excluding the green dockerId.
    expect(prisma.container.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { serviceEnvId: 'env-1', status: ContainerStatus.RUNNING, dockerId: { not: 'docker-green' } },
      }),
    );
    expect(docker.removeContainer).toHaveBeenCalledWith('srv-1', 'docker-blue', true);
    expect(prisma.container.update).toHaveBeenCalledWith({
      where: { id: 'c-blue' },
      data: { status: ContainerStatus.EXITED },
    });
    expect(logs).toContain('[BLUE-GREEN]');
  });

  it('is a no-op when there is no service-environment', async () => {
    const { service, prisma } = build();
    const logs = await cutover(service, null, 'srv-1', 'docker-green', 3001);
    expect(prisma.proxyRule.updateMany).not.toHaveBeenCalled();
    expect(logs).toContain('cut-over ignoré');
  });

  it('does not crash if removing a blue container fails', async () => {
    const { service, docker } = build();
    (docker.removeContainer as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await expect(cutover(service, 'env-1', 'srv-1', 'docker-green', 3001)).resolves.toBeDefined();
  });
});
