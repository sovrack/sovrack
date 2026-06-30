import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { TeamsService } from './teams.service';

describe('TeamsService', () => {
  let prisma: {
    team: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    project: { findUnique: jest.Mock };
    projectMember: { createMany: jest.Mock };
  };
  let service: TeamsService;

  beforeEach(() => {
    prisma = {
      team: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 't1', members: [], ...data }),
          ),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 't1', members: [], ...data }),
          ),
      },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }) },
      projectMember: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    service = new TeamsService(prisma as unknown as PrismaService);
  });

  it('404s findOne for a missing team', async () => {
    prisma.team.findUnique.mockResolvedValue(null);
    await expect(service.findOne('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates a team with a unique name', async () => {
    prisma.team.findUnique.mockResolvedValue(null);
    const res = await service.create({
      name: 'Core',
      description: 'd',
    } as never);
    expect(res.name).toBe('Core');
    expect(prisma.team.create).toHaveBeenCalled();
  });

  it('rejects creating a team whose name already exists', async () => {
    prisma.team.findUnique.mockResolvedValue({ id: 'other', name: 'Core' });
    await expect(
      service.create({ name: 'Core' } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects renaming a team to a name taken by another team', async () => {
    // update(): findUnique verifies team exists; findFirst detects name collision.
    prisma.team.findUnique.mockResolvedValue({
      id: 't1',
      name: 'Old',
      members: [],
    });
    prisma.team.findFirst.mockResolvedValue({ id: 't2', name: 'Taken' }); // collision
    await expect(
      service.update('t1', { name: 'Taken' } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows updating a team keeping its own name', async () => {
    // update(): findUnique finds team; findFirst returns null (no other team has this name).
    prisma.team.findUnique.mockResolvedValue({
      id: 't1',
      name: 'Same',
      members: [],
    });
    prisma.team.findFirst.mockResolvedValue(null); // no conflict
    const res = await service.update('t1', { name: 'Same' } as never);
    expect(prisma.team.update).toHaveBeenCalled();
    expect(res.id).toBe('t1');
  });

  describe('addTeamToProject', () => {
    it('bulk-inserts all team members with skipDuplicates', async () => {
      prisma.team.findUnique.mockResolvedValue({
        id: 't1',
        name: 'Core',
        members: [{ userId: 'u1' }, { userId: 'u2' }],
      });
      await service.addTeamToProject('p1', 't1');
      expect(prisma.projectMember.createMany).toHaveBeenCalledWith({
        data: [
          { projectId: 'p1', userId: 'u1' },
          { projectId: 'p1', userId: 'u2' },
        ],
        skipDuplicates: true,
      });
    });

    it('404s when the project does not exist', async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(
        service.addTeamToProject('missing', 't1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s when the team does not exist', async () => {
      prisma.team.findUnique.mockResolvedValue(null);
      await expect(
        service.addTeamToProject('p1', 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
