import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PlatformRole, Role, StaffStatus } from '@prisma/client';
import { StaffService } from './staff.service';
import { StaffAuditService } from './staff-audit.service';
import { ConfigService } from '@nestjs/config';
import { AccountDeletionService } from '../iam/authorization/account-deletion.service';
import { NotificationsSmtpService } from '../notifications/notifications-smtp.service';
import { StaffOperationsService } from './staff-operations.service';
import { StaffInvitationService } from './staff-invitation.service';
import type { Staff, User } from '@prisma/client';
import { StaffMfaService } from './staff-mfa.service';
import { StaffPlatformReadService } from './staff-platform-read.service';

const staffFixture: Staff = {
  id: 'staff-1',
  email: 'admin@sovrack.tn',
  password: '$argon2id$hashed',
  fullName: 'Root Admin',
  role: PlatformRole.ROOT,
  status: StaffStatus.ACTIVE,
  mfaSecret: null,
  mfaEnabled: false,
  mfaLastUsedStep: null,
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
  provider: 'email',
  googleId: null,
  fullName: 'Client One',
  role: Role.OWNER,
  pendingWorkspaceName: null,
  pendingWorkspaceType: null,
  isActive: true,
  emailVerificationCode: null,
  emailVerificationAttemptId: null,
  emailVerificationExpiresAt: null,
  emailVerifiedAt: null,
  deleteAccountCode: null,
  deleteAccountExpiresAt: null,
  passwordResetCode: null,
  passwordResetExpiresAt: null,
  passwordResetRequestedAt: null,
  passwordResetAttempts: 0,
  sessionVersion: 0,
  legacyStaffRetiredAt: null,
  deletionRequestedAt: null,
  deletionScheduledFor: null,
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
    staffSession: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    staffInvitation: {
      create: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    staffImpersonationGrant: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    staffAuditLog: { create: jest.fn() },
    user: {
      findUnique: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    team: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
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
    get: jest.fn((_key: string, fallback: string) => fallback),
  };
  const accountDeletion = {
    scheduleIdentityDeletion: jest.fn(async () => ({
      scheduledFor: new Date('2026-10-10T00:00:00.000Z'),
    })),
    cancelIdentityDeletion: jest.fn(async () => userFixture),
  };
  const notifications = {
    sendTransactionalEmail: jest.fn(async () => undefined),
  };
  let service: StaffService;
  let invitationService: StaffInvitationService;
  const mfa = {
    verifyLoginSecondFactor: jest.fn(async () => undefined),
    isRequired: jest.fn((role: PlatformRole) => role !== PlatformRole.OPERATOR),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
    invitationService = new StaffInvitationService(
      prisma as never,
      passwordHasher,
      audit as unknown as StaffAuditService,
      config as unknown as ConfigService,
      notifications as unknown as NotificationsSmtpService,
    );
    service = new StaffService(
      prisma as never,
      jwt as unknown as JwtService,
      passwordHasher,
      audit as unknown as StaffAuditService,
      config as unknown as ConfigService,
      new StaffOperationsService(
        prisma as never,
        jwt as unknown as JwtService,
        audit as unknown as StaffAuditService,
        config as unknown as ConfigService,
        accountDeletion as unknown as AccountDeletionService,
      ),
      new StaffPlatformReadService(prisma as never),
      invitationService,
      mfa as unknown as StaffMfaService,
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
        expect.objectContaining({
          role: 'ROOT',
          id: 'staff-1',
          sid: expect.any(String),
        }),
      );
      expect(prisma.staffSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            staffId: 'staff-1',
            tokenHash: expect.any(String),
          }),
        }),
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
      prisma.staffInvitation.create.mockResolvedValue({ id: 'invite-1' });
      prisma.staffInvitation.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.createStaff(
        {
          email: 'op@sovrack.tn',
          fullName: 'Op',
        },
        'staff-1',
        '::1',
      );

      expect(prisma.staff.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: PlatformRole.OPERATOR,
            status: StaffStatus.INVITED,
            email: 'op@sovrack.tn',
            createdBy: 'staff-1',
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'staff.invite' }),
      );
      expect(notifications.sendTransactionalEmail).toHaveBeenCalledWith(
        staffFixture.email,
        expect.stringContaining('activation'),
        expect.stringContaining('/staff/activate?email='),
      );
      expect(result).not.toHaveProperty('password');
    });

    it('refuse un email déjà pris', async () => {
      prisma.staff.findUnique.mockResolvedValue(staffFixture);
      await expect(
        service.createStaff(
          { email: 'admin@sovrack.tn', fullName: 'X' },
          'staff-1',
        ),
      ).rejects.toThrow('existe déjà');
    });
  });

  describe('staff invitation', () => {
    it('active une invitation valide une seule fois', async () => {
      const code = '12345678';
      const codeHash = (
        invitationService as unknown as {
          hashActivationCode: (staffId: string, value: string) => string;
        }
      ).hashActivationCode(staffFixture.id, code);
      prisma.staff.findUnique.mockResolvedValue({
        ...staffFixture,
        status: StaffStatus.INVITED,
        invitation: {
          id: 'invite-1',
          staffId: staffFixture.id,
          tokenHash: codeHash,
          attempts: 0,
          deliveredAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: null,
        },
      });
      prisma.staffInvitation.updateMany.mockResolvedValue({ count: 1 });
      prisma.staff.update.mockResolvedValue(staffFixture);

      const result = await service.acceptStaffInvitation(
        {
          email: staffFixture.email,
          code,
          password: 'Strong-Password-2026!',
        },
        '::1',
      );

      expect(result.message).toContain('Invitation acceptée');
      expect(prisma.staff.update).toHaveBeenCalledWith({
        where: { id: staffFixture.id },
        data: {
          password: expect.any(String),
          status: StaffStatus.ACTIVE,
        },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'staff.invitation.accept' }),
      );
    });

    it('refuse une invitation expirée', async () => {
      prisma.staff.findUnique.mockResolvedValue({
        ...staffFixture,
        status: StaffStatus.INVITED,
        invitation: {
          id: 'invite-1',
          staffId: staffFixture.id,
          tokenHash: '0'.repeat(64),
          attempts: 0,
          deliveredAt: new Date(),
          expiresAt: new Date(Date.now() - 1),
          usedAt: null,
        },
      });

      await expect(
        service.acceptStaffInvitation({
          email: staffFixture.email,
          code: '12345678',
          password: 'Strong-Password-2026!',
        }),
      ).rejects.toThrow('invalide ou expirée');
    });

    it('compte les codes d’activation invalides sans révéler la cause', async () => {
      prisma.staff.findUnique.mockResolvedValue({
        ...staffFixture,
        status: StaffStatus.INVITED,
        invitation: {
          id: 'invite-1',
          staffId: staffFixture.id,
          tokenHash: '0'.repeat(64),
          attempts: 0,
          deliveredAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: null,
        },
      });
      prisma.staffInvitation.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.acceptStaffInvitation({
          email: staffFixture.email,
          code: '12345678',
          password: 'Strong-Password-2026!',
        }),
      ).rejects.toThrow('invalide ou expirée');

      expect(prisma.staffInvitation.updateMany).toHaveBeenCalledWith({
        where: { id: 'invite-1', usedAt: null },
        data: { attempts: { increment: 1 } },
      });
    });

    it('renvoie une réponse neutre pour une demande d’activation inconnue', async () => {
      prisma.staff.findUnique.mockResolvedValue(null);

      const result = await service.requestStaffActivationCode(
        'unknown@sovrack.com',
        '::1',
      );

      expect(result.message).toContain('Si ce compte staff existe');
      expect(notifications.sendTransactionalEmail).not.toHaveBeenCalled();
    });

    it('ne génère pas un second code pendant le délai anti-abus', async () => {
      prisma.staff.findUnique.mockResolvedValue({
        ...staffFixture,
        status: StaffStatus.INVITED,
        invitation: {
          id: 'invite-1',
          deliveredAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const result = await service.requestStaffActivationCode(
        staffFixture.email,
        '::1',
      );

      expect(result.message).toContain('Si ce compte staff existe');
      expect(prisma.staffInvitation.upsert).not.toHaveBeenCalled();
      expect(notifications.sendTransactionalEmail).not.toHaveBeenCalled();
    });
  });

  describe('updateStaff', () => {
    it('révoque immédiatement les sessions après un changement de rôle', async () => {
      const admin = { ...staffFixture, role: PlatformRole.ADMIN };
      prisma.staff.findUnique.mockResolvedValue(admin);
      prisma.staff.update.mockResolvedValue({
        ...admin,
        role: PlatformRole.OPERATOR,
      });

      const result = await service.updateStaff(
        admin.id,
        { role: PlatformRole.OPERATOR },
        'other-root',
        '::1',
      );

      expect(result.role).toBe(PlatformRole.OPERATOR);
      expect(prisma.staffSession.updateMany).toHaveBeenCalledWith({
        where: { staffId: staffFixture.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
    });

    it('interdit de retirer le dernier ROOT actif', async () => {
      prisma.staff.findUnique.mockResolvedValue(staffFixture);
      prisma.staff.count.mockResolvedValue(1);

      await expect(
        service.updateStaff(
          staffFixture.id,
          { status: StaffStatus.DISABLED },
          'other-root',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.staff.update).not.toHaveBeenCalled();
    });

    it('interdit de modifier le rôle ROOT réservé au bootstrap', async () => {
      prisma.staff.findUnique.mockResolvedValue(staffFixture);

      await expect(
        service.updateStaff(
          staffFixture.id,
          { role: PlatformRole.ADMIN },
          staffFixture.id,
        ),
      ).rejects.toThrow('ROOT est immuable');
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

    it('ne traite jamais une ancienne identité Staff comme un client', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...userFixture,
        legacyStaffRetiredAt: new Date('2026-09-08'),
      });
      await expect(
        service.setUserActive('legacy-staff', false, 'staff-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
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

  describe('customer identity lifecycle', () => {
    it('planifie la suppression avec un délai de grâce et journalise le motif', async () => {
      prisma.user.findUnique.mockResolvedValue(userFixture);
      const result = await service.scheduleUserDeletion(
        'user-1',
        'staff-1',
        'Demande client confirmée par le support',
        '::1',
      );

      expect(accountDeletion.scheduleIdentityDeletion).toHaveBeenCalledWith(
        'user-1',
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.deletion.schedule',
          resourceId: 'user-1',
        }),
      );
      expect(result.message).toContain('délai de grâce');
    });

    it('annule une suppression programmée', async () => {
      const result = await service.cancelUserDeletion(
        'user-1',
        'staff-1',
        '::1',
      );

      expect(accountDeletion.cancelIdentityDeletion).toHaveBeenCalledWith(
        'user-1',
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.deletion.cancel' }),
      );
      expect(result.message).toContain('Suppression annulée');
    });

    it('révoque les sessions client et les assistances actives', async () => {
      prisma.user.findUnique.mockResolvedValue(userFixture);
      prisma.user.update.mockResolvedValue(userFixture);
      prisma.staffImpersonationGrant.updateMany.mockResolvedValue({ count: 1 });

      await service.revokeUserSessions('user-1', 'staff-1', '::1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { sessionVersion: { increment: 1 } },
      });
      expect(prisma.staffImpersonationGrant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', endedAt: null } }),
      );
    });
  });

  describe('impersonation cross-domain', () => {
    it('crée un grant bref sans retourner de JWT client au domaine staff', async () => {
      prisma.user.findUnique.mockResolvedValue(userFixture);
      prisma.staffImpersonationGrant.create.mockResolvedValue({
        id: 'grant-1',
      });
      config.get.mockImplementation((key: string, fallback: string) =>
        key === 'CUSTOMER_APP_URL' ? 'https://app.sovrack.test' : fallback,
      );

      const result = await service.impersonateUser(
        userFixture.id,
        staffFixture.id,
        'Diagnostic incident INC-142',
        '::1',
      );

      expect(result.redirectUrl).toMatch(
        /^https:\/\/app\.sovrack\.test\/staff-session-exchange#token=/,
      );
      expect(result).not.toHaveProperty('access_token');
      expect(prisma.staffImpersonationGrant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: userFixture.id,
            staffId: staffFixture.id,
            reason: 'Diagnostic incident INC-142',
            tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
        }),
      );
    });

    it("refuse l'impersonation d'une ancienne identité Staff", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...userFixture,
        legacyStaffRetiredAt: new Date('2026-09-08'),
      });

      await expect(
        service.impersonateUser(
          'legacy-staff',
          staffFixture.id,
          'Diagnostic incident INC-142',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.staffImpersonationGrant.create).not.toHaveBeenCalled();
    });

    it('consomme le grant une seule fois puis émet un JWT client de quinze minutes', async () => {
      prisma.staffImpersonationGrant.findUnique.mockResolvedValue({
        id: 'grant-1',
        staffId: staffFixture.id,
        reason: 'Diagnostic incident INC-142',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: userFixture,
      });
      prisma.staffImpersonationGrant.updateMany.mockResolvedValue({ count: 1 });
      config.get.mockImplementation((key: string, fallback: string) =>
        key === 'JWT_SECRET'
          ? 'customer-jwt-secret-at-least-32-chars'
          : fallback,
      );

      const result = await service.exchangeImpersonationGrant('a'.repeat(43));

      expect(result.access_token).toBe('token-staff');
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          authType: 'staff-impersonation',
          impersonatedByStaffId: staffFixture.id,
          impersonationGrantId: 'grant-1',
          sessionVersion: 0,
        }),
        expect.objectContaining({ expiresIn: '15m' }),
      );
      expect(prisma.staffAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            staffId: staffFixture.id,
            action: 'user.impersonation.exchange',
            resourceId: userFixture.id,
          }),
        }),
      );
    });
  });
});
