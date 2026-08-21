import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { ProjectsService } from './projects.service';
import { ProjectImportService } from './services/project-import.service';
import { ProjectMembersService } from './services/project-members.service';
import { ProjectsController } from './projects.controller';

describe('ProjectsController', () => {
  const user = { id: 'user-1', role: Role.OWNER } as JwtPayload;
  const workspaceId = 'workspace-1';

  function build() {
    const projectsService = {
      create: jest.fn().mockResolvedValue({ id: 'p1' }),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'p1' }),
      update: jest.fn().mockResolvedValue({ id: 'p1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProjectsService;
    const membersService = {
      addMember: jest.fn().mockResolvedValue({ id: 'm1' }),
      getMembers: jest.fn().mockResolvedValue([]),
      removeMember: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProjectMembersService;
    const importService = {
      importGitlabGroup: jest.fn().mockResolvedValue({ imported: 1 }),
    } as unknown as ProjectImportService;
    const ctrl = new ProjectsController(
      projectsService,
      membersService,
      importService,
    );
    return { ctrl, projectsService, membersService, importService };
  }

  it('create / findAll / findOne / update delegate to projectsService', async () => {
    const { ctrl, projectsService } = build();
    await ctrl.create(user, { name: 'x' } as never, workspaceId);
    await ctrl.findAll(user, { page: 1 } as never, workspaceId);
    await ctrl.findOne('p1', user, workspaceId);
    await ctrl.update('p1', user, { name: 'y' } as never, workspaceId);
    expect(projectsService.create).toHaveBeenCalledWith(
      'user-1',
      Role.OWNER,
      { name: 'x' },
      workspaceId,
    );
    expect(projectsService.findAll).toHaveBeenCalledWith(
      'user-1',
      Role.OWNER,
      { page: 1 },
      workspaceId,
    );
    expect(projectsService.findOne).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.OWNER,
      workspaceId,
    );
    expect(projectsService.update).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.OWNER,
      { name: 'y' },
      workspaceId,
    );
  });

  it('remove delegates and returns a success message', async () => {
    const { ctrl, projectsService } = build();
    const res = await ctrl.remove('p1', user, workspaceId);
    expect(projectsService.remove).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.OWNER,
      workspaceId,
    );
    expect(res).toEqual({ message: 'Projet supprimé avec succès' });
  });

  it('importGitlabGroup delegates to the import service', async () => {
    const { ctrl, importService } = build();
    await ctrl.importGitlabGroup(user, { groupId: 'g1' } as never, workspaceId);
    expect(importService.importGitlabGroup).toHaveBeenCalledWith(
      'user-1',
      Role.OWNER,
      { groupId: 'g1' },
      workspaceId,
    );
  });

  it('member endpoints delegate to the members service', async () => {
    const { ctrl, membersService } = build();
    await ctrl.addMember('p1', user, { userId: 'u2' } as never, workspaceId);
    await ctrl.getMembers('p1', user, workspaceId);
    await ctrl.removeMember('p1', 'u2', user, workspaceId);
    expect(membersService.addMember).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.OWNER,
      { userId: 'u2' },
      workspaceId,
    );
    expect(membersService.getMembers).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.OWNER,
      workspaceId,
    );
    expect(membersService.removeMember).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.OWNER,
      'u2',
      workspaceId,
    );
  });
});
