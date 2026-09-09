import { GoogleOAuthService } from './google-oauth.service';

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    fullName: 'User Example',
    password: null,
    provider: 'google',
    googleId: 'google-1',
    role: 'OWNER',
    isActive: true,
    legacyStaffRetiredAt: null,
    emailVerifiedAt: new Date(),
    ...overrides,
  };
}

function makeSvc(opts: { existing?: unknown } = {}) {
  const usersService = {
    findByEmail: jest
      .fn()
      .mockResolvedValue(
        opts.existing === undefined ? makeUser() : opts.existing,
      ),
    findById: jest.fn().mockResolvedValue(makeUser()),
  } as never;

  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest
        .fn()
        .mockImplementation(async ({ where, data }) =>
          makeUser({ id: where.id, ...(data as Record<string, unknown>) }),
        ),
      create: jest.fn().mockResolvedValue(makeUser({ id: 'user-new' })),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
  );

  const teamsService = {
    create: jest.fn().mockResolvedValue({ id: 'team-1', name: 'User Team' }),
  } as never;

  const auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as never;

  return {
    svc: new GoogleOAuthService(
      prisma as never,
      usersService,
      teamsService,
      auditService,
    ),
    prisma,
    usersService,
    teamsService,
    auditService,
  };
}

describe('GoogleOAuthService', () => {
  const profile = {
    googleId: 'google-123',
    email: 'new@example.com',
    fullName: 'New User',
  };

  describe('findOrCreateUser', () => {
    it('returns existing user when already linked by googleId', async () => {
      const existing = makeUser({
        googleId: profile.googleId,
        provider: 'google',
      });
      const { svc, prisma } = makeSvc({ existing });
      prisma.user.findUnique = jest.fn().mockResolvedValue(existing);

      const result = await svc.findOrCreateUser(profile);
      expect(result).toBe(existing);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('refuse de reconnecter une identité Staff historique via Google', async () => {
      const existing = makeUser({
        googleId: profile.googleId,
        legacyStaffRetiredAt: new Date('2026-09-08'),
      });
      const { svc, prisma } = makeSvc({ existing });
      prisma.user.findUnique = jest.fn().mockResolvedValue(existing);

      await expect(svc.findOrCreateUser(profile)).rejects.toThrow(
        'Compte utilisateur indisponible',
      );
    });

    it('links googleId to an existing email account', async () => {
      const existing = makeUser({ email: profile.email, provider: 'email' });
      const { svc, prisma } = makeSvc({ existing });
      prisma.user.findUnique = jest.fn().mockResolvedValue(null);
      prisma.user.update = jest.fn().mockResolvedValue(existing);

      const result = await svc.findOrCreateUser(profile);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existing.id },
          data: expect.objectContaining({ googleId: profile.googleId }),
        }),
      );
      expect(result).toBe(existing);
    });

    it('creates a new user and runs onboarding', async () => {
      const { svc, prisma, usersService, teamsService, auditService } = makeSvc(
        { existing: undefined },
      );
      prisma.user.findUnique = jest.fn().mockResolvedValue(null);
      usersService.findByEmail = jest.fn().mockResolvedValue(null);

      const result = await svc.findOrCreateUser(profile);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            googleId: profile.googleId,
            provider: 'google',
            role: 'MEMBER',
            isActive: true,
          }),
        }),
      );
      expect(teamsService.create).toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalled();
      expect(result.id).toBe('user-new');
    });
  });

  describe('unlinkGoogle', () => {
    it('clears googleId for a user', async () => {
      const { svc, prisma } = makeSvc();
      await svc.unlinkGoogle('user-1');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { googleId: null },
        }),
      );
    });
  });
});
