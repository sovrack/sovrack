import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { TeamsService } from './teams.service';

describe('TeamsService', () => {
  let prisma: {
    team: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: TeamsService;

  beforeEach(() => {
    prisma = {
      team: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
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
    prisma.team.findUnique
      .mockResolvedValueOnce({ id: 't1', name: 'Old', members: [] }) // findOne(id)
      .mockResolvedValueOnce({ id: 't2', name: 'Taken' }); // name collision
    await expect(
      service.update('t1', { name: 'Taken' } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows updating a team keeping its own name', async () => {
    prisma.team.findUnique
      .mockResolvedValueOnce({ id: 't1', name: 'Same', members: [] }) // findOne(id)
      .mockResolvedValueOnce({ id: 't1', name: 'Same' }); // same team, no conflict
    const res = await service.update('t1', { name: 'Same' } as never);
    expect(prisma.team.update).toHaveBeenCalled();
    expect(res.id).toBe('t1');
  });
});
