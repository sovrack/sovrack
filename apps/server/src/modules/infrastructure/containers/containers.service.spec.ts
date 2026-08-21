import { NotFoundException } from '@nestjs/common';
import { ContainerStatus, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { ContainersService } from './containers.service';
import { WorkspaceAccessService } from '../../iam/authorization/workspace-access.service';
import { WorkspaceActions } from '../../iam/authorization/workspace-policy.types';

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
  };
  let docker: Record<string, jest.Mock>;
  let workspaceAccess: {
    resolveWorkspaceId: jest.Mock;
    assertWorkspaceAction: jest.Mock;
    assertServerAction: jest.Mock;
  };
  let svc: ContainersService;

  const container = { id: 'c1', serverId: 'srv1', dockerId: 'dock1' };
  const mockUser = { id: 'u1', role: Role.MEMBER };

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
    workspaceAccess = {
      resolveWorkspaceId: jest.fn().mockResolvedValue('workspace-1'),
      assertWorkspaceAction: jest.fn().mockResolvedValue(undefined),
      assertServerAction: jest.fn().mockResolvedValue(undefined),
    };
    svc = new ContainersService(
      prisma as unknown as PrismaService,
      workspaceAccess as unknown as WorkspaceAccessService,
      docker as unknown as DockerApiService,
    );
  });

  describe('findAll', () => {
    it('always filters through the active workspace server relation', async () => {
      await svc.findAll({}, mockUser.id, mockUser.role);
      expect(prisma.container.findMany).toHaveBeenCalledWith({
        where: { server: { teamId: 'workspace-1' } },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('filters by serviceEnvId (C1: senv-scoped container list)', async () => {
      await svc.findAll({ serviceEnvId: 'senv1' }, mockUser.id, mockUser.role);
      expect(prisma.container.findMany).toHaveBeenCalledWith({
        where: {
          server: { teamId: 'workspace-1' },
          serviceEnvId: 'senv1',
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('combines all 4 filters when provided together', async () => {
      await svc.findAll(
        {
          serverId: 'srv1',
          serviceId: 'svc1',
          deploymentId: 'dep1',
          serviceEnvId: 'senv1',
        },
        mockUser.id,
        mockUser.role,
      );
      expect(prisma.container.findMany).toHaveBeenCalledWith({
        where: {
          server: { teamId: 'workspace-1' },
          serverId: 'srv1',
          serviceId: 'svc1',
          deploymentId: 'dep1',
          serviceEnvId: 'senv1',
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('checks server access when serverId is provided', async () => {
      await svc.findAll({ serverId: 'srv1' }, mockUser.id, mockUser.role);
      expect(workspaceAccess.assertServerAction).toHaveBeenCalledWith(
        'srv1',
        mockUser.id,
        WorkspaceActions.READ_SERVER,
        'workspace-1',
      );
    });
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
    it('resolves the container server and checks workspace access', async () => {
      await svc.assertCanAccessContainer('c1', mockUser.id, mockUser.role);
      expect(workspaceAccess.assertServerAction).toHaveBeenCalledWith(
        'srv1',
        'u1',
        WorkspaceActions.READ_SERVER,
        undefined,
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
