import { BadRequestException } from '@nestjs/common';
import { ContainerStatus } from '@prisma/client';
import { ContainerLifecycleService } from './container-lifecycle.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';

describe('ContainerLifecycleService', () => {
  function make(listed: unknown[] = []) {
    const docker = {
      listContainers: jest.fn().mockResolvedValue(listed),
      stopContainer: jest.fn().mockResolvedValue(undefined),
      startContainer: jest.fn().mockResolvedValue(undefined),
      removeContainer: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      container: { updateMany: jest.fn().mockResolvedValue({}) },
    };
    const gateway = { emitLog: jest.fn() };
    const svc = new ContainerLifecycleService(
      prisma as unknown as PrismaService,
      docker as unknown as DockerApiService,
      gateway as unknown as DeploymentEventsPublisher,
    );
    return { svc, docker, prisma, gateway };
  }

  describe('assertNoForeignPortConflict', () => {
    it('throws when a DIFFERENT service already publishes the port', async () => {
      const { svc } = make([
        {
          Id: 'other',
          Names: ['/some-other-svc'],
          Ports: [{ PublicPort: 8080 }],
        },
      ]);
      await expect(
        svc.assertNoForeignPortConflict('srv', 'app-web-', 8080, true),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ignores OUR own containers on the same port (same prefix)', async () => {
      const { svc } = make([
        { Id: 'mine', Names: ['/app-web-aaaa'], Ports: [{ PublicPort: 8080 }] },
      ]);
      await expect(
        svc.assertNoForeignPortConflict('srv', 'app-web-', 8080, true),
      ).resolves.toBe('');
    });

    it('is a no-op when the service does not publish a host port (Traefik)', async () => {
      const { svc, docker } = make();
      await svc.assertNoForeignPortConflict('srv', 'app-web-', 8080, false);
      expect(docker.listContainers).not.toHaveBeenCalled();
    });
  });

  describe('listServiceContainers', () => {
    it('returns only containers matching the prefix, name normalized', async () => {
      const { svc } = make([
        { Id: 'a', Names: ['/app-web-1111'] },
        { Id: 'b', Names: ['/other-svc'] },
      ]);
      const res = await svc.listServiceContainers('srv', 'app-web-');
      expect(res).toEqual([{ id: 'a', name: 'app-web-1111' }]);
    });
  });

  it('stopContainers stops each (best-effort) without throwing', async () => {
    const { svc, docker } = make();
    docker.stopContainer.mockRejectedValueOnce(new Error('boom'));
    const logs = await svc.stopContainers(
      'srv',
      [
        { id: 'c1', name: 'n1' },
        { id: 'c2', name: 'n2' },
      ],
      'dep',
    );
    expect(docker.stopContainer).toHaveBeenCalledTimes(2);
    expect(logs).toContain('arrêté');
  });

  it('restartContainers starts each (recovery after a failed deploy)', async () => {
    const { svc, docker } = make();
    await svc.restartContainers('srv', [{ id: 'c1', name: 'n1' }], 'dep');
    expect(docker.startContainer).toHaveBeenCalledWith('srv', 'c1');
  });

  it('removeContainers removes each and marks the DB row EXITED', async () => {
    const { svc, docker, prisma } = make();
    await svc.removeContainers('srv', [{ id: 'c1', name: 'n1' }], 'dep');
    expect(docker.removeContainer).toHaveBeenCalledWith('srv', 'c1', true);
    expect(prisma.container.updateMany).toHaveBeenCalledWith({
      where: { dockerId: 'c1' },
      data: { status: ContainerStatus.EXITED },
    });
  });
});
