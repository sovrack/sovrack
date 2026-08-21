import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PlatformRole, Role, StaffStatus } from '@prisma/client';
import { PasswordHasher } from '../iam/security/password-hasher.service';
import { StaffService } from './staff.service';
import { StaffAuditService } from './staff-audit.service';
import { ConfigService } from '@nestjs/config';
import { AccountDeletionService } from '../iam/authorization/account-deletion.service';
import type { Staff, User } from '@prisma/client';

const staffFixture: Staff = {
  id: 'staff-1',
  email: 'admin@sovrack.tn',
  password: '$argon2id$hashed',
  fullName: 'Root Admin',
  role: PlatformRole.ROOT,
  status: StaffStatus.ACTIVE,
  mfaSecret: null,
  mfaEnabled: false,
  lastLoginAt: null,
  deletedAt: null,
  createdBy: 'seed',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const userFixture: User = {
  id: 'user-1',
  email: 'client@sovrack.tn',
  password: 'x',
  fullName: 'Client One',
  role: Role.OWNER,
  isActive: true,
  emailVerificationCode: null,
  emailVerificationAttemptId: null,
  emailVerificationExpiresAt: null,
  emailVerifiedAt: null,
  deleteAccountCode: null,
  deleteAccountExpiresAt: null,
  passwordResetCode: null,
  passwordResetExpiresAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('StaffService', () => {
  const prisma = {
    staff: {
      findUnique: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    team: { count: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
    subscription: { groupBy: jest.fn(), findMany: jest.fn() },
    teamMember: { findMany: jest.fn(), deleteMany: jest.fn() },
    auditLog: { deleteMany: jest.fn() },
    sshKey: { deleteMany: jest.fn() },
    project: { deleteMany: jest.fn() },
    server: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const jwt = {
    sign: jest.fn(() => 'token-staff'),
  };
  const passwordHasher = {
    hash: jest.fn(async (p: string) => `$argon2id$${p}`),
    verify: jest.fn(async () => true),
    needsRehash: jest.fn(() => false),
  };
  const audit = {
    record: jest.fn(async () => undefined),
  };
  const config = {
    getOrThrow: jest.fn(() => 'customer-jwt-secret-at-least-32-chars'),
  };
  const accountDeletion = {
    deleteIdentity: jest.fn(async () => undefined),
  };
  let service: StaffService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StaffService(
      prisma as never,
      jwt as unknown as JwtService,
      passwordHasher as unknown as PasswordHasher,
      audit as unknown as StaffAuditService,
      config as unknown as ConfigService,
      accountDeletion as unknown as AccountDeletionService,
    );
  });

  describe('login', () => {
    it('authentifie un staff actif et journalise le login', async () => {
      prisma.staff.findUnique.mockResolvedValue(staffFixture);
      prisma.staff.update.mockResolvedValue({
        ...staffFixture,
        lastLoginAt: new Date(),
      });

      const result = await service.login(
        { email: 'ADMIN@sovrack.tn', password: 'whatever' },
        '::1',
      );

      expect(result.access_token).toBe('token-staff');
      expect(result.staff).not.toHaveProperty('password');
      expect(result.staff).not.toHaveProperty('mfaSecret');
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'ROOT', id: 'staff-1' }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'staff.login', ip: '::1' }),
      );
    });

    it('rejette un staff supprimé (soft delete)', async () => {
      prisma.staff.findUnique.mockResolvedValue({
        ...staffFixture,
        deletedAt: new Date(),
      });
      await expect(
        service.login({ email: 'a@b.tn', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejette un staff non ACTIVE', async () => {
      prisma.staff.findUnique.mockResolvedValue({
        ...staffFixture,
        status: StaffStatus.BLOCKED,
      });
      await expect(
        service.login({ email: 'a@b.tn', password: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejette un mauvais mot de passe', async () => {
      prisma.staff.findUnique.mockResolvedValue(staffFixture);
      passwordHasher.verify.mockResolvedValueOnce(false);
      await expect(
        service.login({ email: 'a@b.tn', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('me', () => {
    it('retourne le profil sans champs sensibles', async () => {
      prisma.staff.findUnique.mockResolvedValue(staffFixture);
      const result = await service.me('staff-1');
      expect(result.email).toBe('admin@sovrack.tn');
      expect(result).not.toHaveProperty('password');
    });

    it('lève NotFound si absent', async () => {
      prisma.staff.findUnique.mockResolvedValue(null);
      await expect(service.me('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createStaff', () => {
    it('crée un OPERATOR par défaut et journalise', async () => {
      prisma.staff.findUnique.mockResolvedValue(null);
      prisma.staff.create.mockResolvedValue(staffFixture);

      const result = await service.createStaff(
        {
          email: 'op@sovrack.tn',
          password: 'Password1',
          fullName: 'Op',
        },
        'staff-1',
        '::1',
      );

      expect(prisma.staff.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: PlatformRole.OPERATOR,
            email: 'op@sovrack.tn',
            createdBy: 'staff-1',
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'staff.create' }),
      );
      expect(result).not.toHaveProperty('password');
    });

    it('refuse un email déjà pris', async () => {
      prisma.staff.findUnique.mockResolvedValue(staffFixture);
      await expect(
        service.createStaff(
          { email: 'admin@sovrack.tn', password: 'Password1', fullName: 'X' },
          'staff-1',
        ),
      ).rejects.toThrow('existe déjà');
    });
  });

  describe('setUserActive', () => {
    it('désactive un client et journalise user.block', async () => {
      prisma.user.findUnique.mockResolvedValue(userFixture);
      prisma.user.update.mockResolvedValue({
        ...userFixture,
        isActive: false,
      });

      const result = await service.setUserActive(
        'user-1',
        false,
        'staff-1',
        '::1',
      );

      expect(result.isActive).toBe(false);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.block', resourceId: 'user-1' }),
      );
    });

    it('lève NotFound si utilisateur absent', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.setUserActive('nope', true, 'staff-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setUserRole', () => {
    it('change le rôle client et journalise', async () => {
      prisma.user.findUnique.mockResolvedValue(userFixture);
      prisma.user.update.mockResolvedValue({
        ...userFixture,
        role: Role.MEMBER,
      });

      const result = await service.setUserRole(
        'user-1',
        Role.MEMBER,
        'staff-1',
      );

      expect(result.role).toBe('MEMBER');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.role.change' }),
      );
    });
  });

  describe('listUsers', () => {
    it('retourne une page paginée', async () => {
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([userFixture]);
      const result = await service.listUsers({ page: 1, limit: 50 });
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('deleteUser', () => {
    it('supprime uniquement l’identité via le service de domaine', async () => {
      prisma.user.findUnique.mockResolvedValue(userFixture);
      prisma.teamMember.findMany.mockResolvedValue([{ teamId: 'team-1' }]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: typeof prisma) => Promise<void>) => fn(prisma),
      );

      const result = await service.deleteUser('user-1', 'staff-1', '::1');

      expect(accountDeletion.deleteIdentity).toHaveBeenCalledWith('user-1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.delete',
          resourceId: 'user-1',
        }),
      );
      expect(result.message).toContain('supprimé');
    });
  });
});
