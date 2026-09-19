import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformRole, StaffStatus, type Staff } from '@prisma/client';
import { PasswordHasher } from '../iam/security/password-hasher.service';
import { NotificationsSmtpService } from '../notifications/notifications-smtp.service';
import { StaffAuditService } from './staff-audit.service';
import { StaffPasswordRecoveryService } from './staff-password-recovery.service';

const staff: Staff = {
  id: 'staff-1',
  email: 'contact@sovrack.tech',
  password: '$argon2id$old',
  fullName: 'Root Admin',
  role: PlatformRole.ROOT,
  status: StaffStatus.ACTIVE,
  mfaSecret: null,
  mfaEnabled: false,
  mfaLastUsedStep: null,
  lastLoginAt: null,
  deletedAt: null,
  createdBy: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('StaffPasswordRecoveryService', () => {
  const prisma = {
    staff: { findUnique: jest.fn(), update: jest.fn() },
    staffSession: { updateMany: jest.fn() },
    staffPasswordReset: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const passwordHasher = {
    hash: jest.fn(async (password: string) => `$argon2id$${password}`),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const config = { getOrThrow: jest.fn(() => 's'.repeat(64)) };
  const notifications = {
    sendTransactionalEmail: jest.fn(async () => undefined),
  };
  let service: StaffPasswordRecoveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
    service = new StaffPasswordRecoveryService(
      prisma as never,
      passwordHasher as unknown as PasswordHasher,
      audit as unknown as StaffAuditService,
      config as unknown as ConfigService,
      notifications as unknown as NotificationsSmtpService,
    );
  });

  it('crée un code haché, invalide les anciens et envoie le message', async () => {
    prisma.staff.findUnique.mockResolvedValue(staff);
    prisma.staffPasswordReset.updateMany.mockResolvedValue({ count: 1 });
    prisma.staffPasswordReset.create.mockResolvedValue({
      id: 'reset-1',
      staffId: staff.id,
    });

    const result = await service.forgotPassword({ email: staff.email }, '::1');

    expect(result.message).toContain('Si ce compte staff existe');
    expect(prisma.staffPasswordReset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        staffId: staff.id,
        codeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    });
    expect(notifications.sendTransactionalEmail).toHaveBeenCalledWith(
      staff.email,
      expect.stringContaining('récupération'),
      expect.stringContaining('10 minutes'),
    );
  });

  it('ne révèle pas un compte staff inconnu', async () => {
    prisma.staff.findUnique.mockResolvedValue(null);

    const result = await service.forgotPassword({
      email: 'unknown@sovrack.tech',
    });

    expect(result.message).toContain('Si ce compte staff existe');
    expect(notifications.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('ne révèle pas une panne SMTP et rend le code inutilisable', async () => {
    prisma.staff.findUnique.mockResolvedValue(staff);
    prisma.staffPasswordReset.findFirst.mockResolvedValue(null);
    prisma.staffPasswordReset.updateMany.mockResolvedValue({ count: 1 });
    prisma.staffPasswordReset.create.mockResolvedValue({
      id: 'reset-smtp-failed',
      staffId: staff.id,
    });
    notifications.sendTransactionalEmail.mockRejectedValueOnce(
      new Error('smtp unavailable'),
    );

    const result = await service.forgotPassword({ email: staff.email }, '::1');

    expect(result.message).toContain('Si ce compte staff existe');
    expect(prisma.staffPasswordReset.updateMany).toHaveBeenCalledWith({
      where: { id: 'reset-smtp-failed', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'staff.password.reset.delivery_failed',
      }),
    );
  });

  it('applique un délai entre deux demandes de code', async () => {
    prisma.staff.findUnique.mockResolvedValue(staff);
    prisma.staffPasswordReset.findFirst.mockResolvedValue({ id: 'recent' });

    const result = await service.forgotPassword({ email: staff.email }, '::1');

    expect(result.message).toContain('Si ce compte staff existe');
    expect(prisma.staffPasswordReset.create).not.toHaveBeenCalled();
    expect(notifications.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('réinitialise le mot de passe et révoque toutes les sessions', async () => {
    prisma.staff.findUnique.mockResolvedValue(staff);
    const code = '12345678';
    const hashCode = (
      service as unknown as {
        hashCode: (staffId: string, value: string) => string;
      }
    ).hashCode(staff.id, code);
    prisma.staffPasswordReset.findFirst.mockResolvedValue({
      id: 'reset-1',
      staffId: staff.id,
      codeHash: hashCode,
      attempts: 0,
    });
    prisma.staffPasswordReset.updateMany.mockResolvedValue({ count: 1 });
    prisma.staff.update.mockResolvedValue(staff);

    const result = await service.resetPassword({
      email: staff.email,
      code,
      password: 'Strong-Password-2026!',
    });

    expect(result.message).toContain('réinitialisé');
    expect(prisma.staff.update).toHaveBeenCalledWith({
      where: { id: staff.id },
      data: { password: expect.any(String) },
    });
    expect(prisma.staffSession.updateMany).toHaveBeenCalledWith({
      where: { staffId: staff.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('compte les essais invalides et refuse le code', async () => {
    prisma.staff.findUnique.mockResolvedValue(staff);
    prisma.staffPasswordReset.findFirst.mockResolvedValue({
      id: 'reset-1',
      staffId: staff.id,
      codeHash: '0'.repeat(64),
      attempts: 0,
    });
    prisma.staffPasswordReset.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.resetPassword({
        email: staff.email,
        code: '12345678',
        password: 'Strong-Password-2026!',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.staffPasswordReset.updateMany).toHaveBeenCalledWith({
      where: { id: 'reset-1', usedAt: null },
      data: { attempts: { increment: 1 } },
    });
  });
});
