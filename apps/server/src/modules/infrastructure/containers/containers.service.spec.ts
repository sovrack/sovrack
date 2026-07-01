import { NotFoundException } from '@nestjs/common';
import { ContainerStatus, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ProjectAccessService } from '../../catalog/access/project-access.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { ContainersService } from './containers.service';

describe('ContainersService', () => {
  let prisma: {
    container: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    server: { findUnique: jest.Mock };
  };
  let docker: Record<string, jest.Mock>;
  let projectAccess: {
    assertCanAccessProject: jest.Mock;
    assertCanManageProject: jest.Mock;
  };
  let svc: ContainersService;

  const container = { id: 'c1', serverId: 'srv1', dockerId: 'dock1' };
  const mockUser = { id: 'u1', role: Role.DEVELOPER };

  beforeEach(() => {
    prisma = {
      container: {
        findUnique: jest.fn().mockResolvedValue(container),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      server: {
        findUnique: jest.fn().mockResolvedValue({
          environment: { projectId: 'p1' },
        }),
      },
    };
    docker = {
      startContainer: jest.fn().mockResolvedValue(undefined),
      stopContainer: jest.fn().mockResolvedValue(undefined),
      restartContainer: jest.fn().mockResolvedValue(undefined),
      removeContainer: jest.fn().mockResolvedValue(undefined),
      inspectContainer: jest.fn().mockResolvedValue({ State: {} }),
      getContainerStats: jest.fn().mockResolvedValue({}),
      listContainers: jest.fn().mockResolvedValue([]),
    };
    projectAccess = {
      assertCanAccessProject: jest.fn().mockResolvedValue(undefined),
      assertCanManageProject: jest.fn().mockResolvedValue(undefined),
    };
    svc = new ContainersService(
      prisma as unknown as PrismaService,
      projectAccess as unknown as ProjectAccessService,
      docker as unknown as DockerApiService,
    );
  });

  describe('findOne', () => {
    it('returns the container', async () => {
      expect(await svc.findOne('c1')).toBe(container);
    });
    it('throws NotFound when missing', async () => {
      prisma.container.findUnique.mockResolvedValue(null);
      await expect(svc.findOne('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('assertCanAccessContainer', () => {
    it('resolves project from server and checks read access', async () => {
      await svc.assertCanAccessContainer('c1', mockUser.id, mockUser.role);
      expect(prisma.server.findUnique).toHaveBeenCalledWith({
        where: { id: 'srv1' },
        select: { environment: { select: { projectId: true } } },
      });
      expect(projectAccess.assertCanAccessProject).toHaveBeenCalledWith(
        'p1',
        'u1',
        Role.DEVELOPER,
      );
    });
  });

  describe('lifecycle ops drive Docker by (serverId, dockerId) + sync status', () => {
    it('start → startContainer + status RUNNING', async () => {
      await svc.start('c1');
      expect(docker.startContainer).toHaveBeenCalledWith('srv1', 'dock1');
      expect(prisma.container.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ContainerStatus.RUNNING }),
        }),
      );
    });
    it('stop → stopContainer + status EXITED', async () => {
      await svc.stop('c1');
      expect(docker.stopContainer).toHaveBeenCalledWith('srv1', 'dock1');
      expect(prisma.container.update.mock.calls[0][0].data.status).toBe(
        ContainerStatus.EXITED,
      );
    });
    it('restart → restartContainer + status RUNNING', async () => {
      await svc.restart('c1');
      expect(docker.restartContainer).toHaveBeenCalledWith('srv1', 'dock1');
    });
    it('remove → removeContainer(force) + deletes the row', async () => {
      await svc.remove('c1');
      expect(docker.removeContainer).toHaveBeenCalledWith(
        'srv1',
        'dock1',
        true,
      );
      expect(prisma.container.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
    });
  });

  describe('destructive ops are guarded by the 404 check', () => {
    beforeEach(() => prisma.container.findUnique.mockResolvedValue(null));
    it('remove on a missing container → 404, Docker never touched', async () => {
      await expect(svc.remove('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(docker.removeContainer).not.toHaveBeenCalled();
    });
    it('stop on a missing container → 404', async () => {
      await expect(svc.stop('ghost')).rejects.toBeInstanceOf(NotFoundException);
      expect(docker.stopContainer).not.toHaveBeenCalled();
    });
  });

  describe('syncFromDocker', () => {
    it('updates an existing row and creates a new one, mapping the state', async () => {
      docker.listContainers.mockResolvedValue([
        { Id: 'dock1', Names: ['/app'], Image: 'img', State: 'running' },
        { Id: 'dock2', Names: ['/db'], Image: 'pg', State: 'exited' },
      ]);
      prisma.container.findFirst
        .mockResolvedValueOnce({ id: 'c1' })
        .mockResolvedValueOnce(null);

      const count = await svc.syncFromDocker('srv1');
      expect(count).toBe(2);
      expect(prisma.container.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ContainerStatus.RUNNING }),
        }),
      );
      expect(prisma.container.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dockerId: 'dock2',
            name: 'db',
            status: ContainerStatus.EXITED,
          }),
        }),
      );
    });
  });
});
