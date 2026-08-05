import { SuperAdminService } from './super-admin.service';

describe('SuperAdminService', () => {
  const prisma = {
    user: {
      groupBy: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    team: { count: jest.fn(), findMany: jest.fn() },
    subscription: { groupBy: jest.fn(), findMany: jest.fn() },
    teamMember: { findMany: jest.fn() },
  };
  let service: SuperAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SuperAdminService(prisma as never);
  });

  describe('getOverview', () => {
    it('returns aggregated stats with defaults for missing roles/status', async () => {
      prisma.user.groupBy.mockResolvedValue([
        { role: 'OWNER', _count: { id: 3 } },
        { role: 'MEMBER', _count: { id: 2 } },
      ]);
      prisma.user.count.mockResolvedValue(4);
      prisma.team.count.mockResolvedValue(2);
      prisma.subscription.groupBy.mockResolvedValue([
        { status: 'ACTIVE', _count: { id: 1 } },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);

      const result = await service.getOverview();

      expect(prisma.user.groupBy).toHaveBeenCalledWith({
        by: ['role'],
        _count: { id: true },
      });
      expect(result).toEqual({
        users: {
          total: 5,
          active: 4,
          owners: 3,
          members: 2,
        },
        teams: { total: 2 },
        subscriptions: {
          total: 1,
          active: 1,
          trialing: 0,
          canceled: 0,
        },
        recentUsers: [{ id: 'u1' }],
      });
    });
  });

  describe('listUsers', () => {
    it('applies defaults when no pagination is provided', async () => {
      prisma.user.count.mockResolvedValue(120);
      prisma.user.findMany.mockResolvedValue([]);
      const result = await service.listUsers();
      expect(result).toMatchObject({
        total: 120,
        page: 1,
        limit: 50,
        items: [],
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
    });

    it('clamps page and limit within bounds', async () => {
      prisma.user.count.mockResolvedValue(10);
      prisma.user.findMany.mockResolvedValue([]);
      const result = await service.listUsers({ page: 0, limit: 1000 });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
    });
  });

  describe('listTeams', () => {
    it('returns paginated teams with counts', async () => {
      prisma.team.count.mockResolvedValue(2);
      prisma.team.findMany.mockResolvedValue([{ id: 't1' }]);
      const result = await service.listTeams({ page: 2, limit: 10 });
      expect(result).toMatchObject({ total: 2, page: 2, limit: 10 });
      expect(prisma.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  describe('listSubscriptions', () => {
    it('returns subscriptions ordered by creation', async () => {
      prisma.subscription.findMany.mockResolvedValue([{ id: 's1' }]);
      const result = await service.listSubscriptions();
      expect(result).toEqual([{ id: 's1' }]);
      expect(prisma.subscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });
  });

  describe('listUsersForTeam', () => {
    it('queries team members for a given team', async () => {
      prisma.teamMember.findMany.mockResolvedValue([{ userId: 'u1' }]);
      const result = await service.listUsersForTeam('team-1');
      expect(result).toEqual([{ userId: 'u1' }]);
      expect(prisma.teamMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { teamId: 'team-1' } }),
      );
    });
  });
});
