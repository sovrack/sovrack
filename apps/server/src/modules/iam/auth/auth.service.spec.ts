import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

function makeUser(
  overrides: Partial<{
    id: string;
    email: string;
    password: string;
    isActive: boolean;
    role: string;
  }> = {},
) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    password: 'argon2id-hash',
    isActive: true,
    role: 'USER',
    fullName: 'User Example',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSvc(
  opts: {
    user?: ReturnType<typeof makeUser> | null;
    passwordValid?: boolean;
    needsRehash?: boolean;
    rehashError?: boolean;
  } = {},
) {
  const user = opts.user !== undefined ? opts.user : makeUser();

  const usersService = {
    findByEmail: jest.fn().mockResolvedValue(user),
    findById: jest.fn().mockResolvedValue(user),
    create: jest.fn().mockResolvedValue(makeUser()),
  } as never;

  const jwtService = {
    sign: jest.fn().mockReturnValue('jwt-token'),
  } as never;

  const prisma = {
    user: {
      update: opts.rehashError
        ? jest.fn().mockRejectedValue(new Error('db error'))
        : jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue(undefined),
    },
  } as never;

  const auditService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as never;

  const passwordHasher = {
    verify: jest.fn().mockResolvedValue(opts.passwordValid ?? true),
    needsRehash: jest.fn().mockReturnValue(opts.needsRehash ?? false),
    hash: jest.fn().mockResolvedValue('new-argon2-hash'),
  } as never;

  const teamsService = {
    create: jest.fn().mockResolvedValue({ id: 'team-1', name: 'Mon équipe' }),
  } as never;

  const billingService = {
    ensureSubscription: jest.fn().mockResolvedValue({ id: 'sub-1' }),
  } as never;

  const emailVerification = {
    startPendingRegistration: jest.fn().mockResolvedValue(undefined),
    verifyCodeAndActivate: jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'OWNER',
    }),
    resendCode: jest.fn().mockResolvedValue(undefined),
  } as never;

  return {
    svc: new AuthService(
      usersService,
      jwtService,
      prisma,
      auditService,
      passwordHasher,
      teamsService,
      billingService,
      emailVerification,
    ),
    usersService,
    jwtService,
    auditService,
    passwordHasher,
    prisma,
    teamsService,
    billingService,
    emailVerification,
  };
}

describe('AuthService', () => {
  describe('login', () => {
    it('returns access_token and user without password on success', async () => {
      const { svc } = makeSvc();
      const result = await svc.login({
        email: 'user@example.com',
        password: 'pass',
      });
      expect(result.access_token).toBe('jwt-token');
      expect(result.user).not.toHaveProperty('password');
      expect(result.user.email).toBe('user@example.com');
    });

    it('throws UnauthorizedException when user is not found', async () => {
      const { svc } = makeSvc({ user: null });
      await expect(
        svc.login({ email: 'x@x.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password is invalid', async () => {
      const { svc } = makeSvc({ passwordValid: false });
      await expect(
        svc.login({ email: 'user@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for Google-linked account (no password)', async () => {
      const { svc } = makeSvc({ user: makeUser({ password: null as never }) });
      await expect(
        svc.login({ email: 'user@example.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user account is inactive', async () => {
      const { svc } = makeSvc({ user: makeUser({ isActive: false }) });
      await expect(
        svc.login({ email: 'user@example.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rehashes password when needsRehash returns true', async () => {
      const { svc, passwordHasher, prisma } = makeSvc({ needsRehash: true });
      await svc.login({ email: 'user@example.com', password: 'pass' });
      expect(passwordHasher.hash).toHaveBeenCalledWith('pass');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { password: 'new-argon2-hash' } }),
      );
    });

    it('does not block login when rehash throws', async () => {
      const { svc } = makeSvc({ needsRehash: true, rehashError: true });
      const result = await svc.login({
        email: 'user@example.com',
        password: 'pass',
      });
      expect(result.access_token).toBe('jwt-token');
    });

    it('records AUTH_LOGIN audit event', async () => {
      const { svc, auditService } = makeSvc();
      await svc.login({ email: 'user@example.com', password: 'pass' });
      expect(auditService.record).toHaveBeenCalledWith(
        'user-1',
        'AUTH_LOGIN',
        'User',
        'user-1',
        expect.objectContaining({ email: 'user@example.com' }),
      );
    });
  });

  describe('logout', () => {
    it('records AUTH_LOGOUT and returns message', async () => {
      const { svc, auditService } = makeSvc();
      const result = await svc.logout('user-1');
      expect(result.message).toContain('Déconnexion');
      expect(auditService.record).toHaveBeenCalledWith(
        'user-1',
        'AUTH_LOGOUT',
        'User',
        'user-1',
      );
    });
  });

  describe('getMe', () => {
    it('returns user without password field', async () => {
      const { svc } = makeSvc();
      const result = await svc.getMe('user-1');
      expect(result).not.toHaveProperty('password');
      expect(result.email).toBe('user@example.com');
    });

    it('throws NotFoundException when user is not found', async () => {
      const { svc } = makeSvc({ user: null });
      await expect(svc.getMe('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateWsToken', () => {
    it('calls jwtService.sign with sub and role, expires in 5m', () => {
      const { svc, jwtService } = makeSvc();
      const token = svc.generateWsToken('user-1', 'OWNER');
      expect(token).toBe('jwt-token');
      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 'user-1', role: 'OWNER' },
        { expiresIn: '5m' },
      );
    });
  });

  describe('register', () => {
    const dto = {
      email: 'new@example.com',
      password: 'StrongPass123!',
      fullName: 'New User',
      teamName: 'New Team',
    };

    it('creates a pending account without team/billing/login', async () => {
      const {
        svc,
        emailVerification,
        usersService,
        teamsService,
        billingService,
      } = makeSvc();
      const result = await svc.register(dto);
      expect(emailVerification.startPendingRegistration).toHaveBeenCalledWith({
        email: dto.email,
        password: dto.password,
        fullName: dto.fullName,
        role: 'OWNER',
      });
      expect(usersService.create).not.toHaveBeenCalled();
      expect(teamsService.create).not.toHaveBeenCalled();
      expect(billingService.ensureSubscription).not.toHaveBeenCalled();
      expect(result).toEqual({ email: dto.email });
    });
  });

  describe('verifyEmail', () => {
    it('verifies code, runs onboarding and returns a JWT', async () => {
      const {
        svc,
        emailVerification,
        usersService,
        teamsService,
        billingService,
        jwtService,
      } = makeSvc();
      const verified = makeUser({ id: 'user-1', email: 'user@example.com' });
      usersService.findById = jest.fn().mockResolvedValue(verified);
      emailVerification.verifyCodeAndActivate = jest
        .fn()
        .mockImplementation(async ({ onActivate }) => {
          await onActivate('user-1');
          return {
            id: 'user-1',
            email: 'user@example.com',
            role: 'OWNER',
          };
        });

      const result = await svc.verifyEmail({
        email: 'user@example.com',
        code: '123456',
      });

      expect(emailVerification.verifyCodeAndActivate).toHaveBeenCalledWith({
        email: 'user@example.com',
        code: '123456',
        onActivate: expect.any(Function),
      });
      expect(teamsService.create).toHaveBeenCalled();
      expect(billingService.ensureSubscription).toHaveBeenCalledWith('team-1');
      expect(jwtService.sign).toHaveBeenCalled();
      expect(result.access_token).toBe('jwt-token');
      expect(result.user.email).toBe('user@example.com');
      expect(result.user).not.toHaveProperty('password');
    });

    it('throws NotFoundException when user is missing after activation', async () => {
      const { svc, usersService } = makeSvc();
      usersService.findById = jest.fn().mockResolvedValue(null);
      await expect(
        svc.verifyEmail({ email: 'user@example.com', code: '123456' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resendVerificationCode', () => {
    it('delegates to emailVerification.resendCode', async () => {
      const { svc, emailVerification } = makeSvc();
      const result = await svc.resendVerificationCode('user@example.com');
      expect(emailVerification.resendCode).toHaveBeenCalledWith(
        'user@example.com',
      );
      expect(result).toEqual({ email: 'user@example.com' });
    });
  });
});
