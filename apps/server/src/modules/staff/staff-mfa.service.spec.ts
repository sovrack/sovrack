import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformRole, StaffStatus, type Staff } from '@prisma/client';
import { createHmac } from 'crypto';
import { CryptoService } from '../../shared/crypto/crypto.service';
import { PasswordHasher } from '../iam/security/password-hasher.service';
import { StaffAuditService } from './staff-audit.service';
import { StaffMfaService } from './staff-mfa.service';

const staff: Staff = {
  id: 'staff-1',
  email: 'contact@sovrack.tech',
  password: 'hashed-password',
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

function decodeBase32(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...value]
    .map((character) =>
      alphabet.indexOf(character).toString(2).padStart(5, '0'),
    )
    .join('');
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string, nowMs: number): string {
  const step = BigInt(Math.floor(nowMs / 1000 / 30));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(step);
  const digest = createHmac('sha1', decodeBase32(secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) >>>
    0;
  return (binary % 1_000_000).toString().padStart(6, '0');
}

describe('StaffMfaService', () => {
  const prisma = {
    staff: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    staffMfaRecoveryCode: {
      count: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
    },
    staffSession: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const passwordHasher = {
    verify: jest.fn(async () => true),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const config = {
    get: jest.fn((_key: string, fallback: string) => fallback),
    getOrThrow: jest.fn(() => 'independent-staff-otp-secret-32-characters'),
  };
  let service: StaffMfaService;

  beforeAll(() => {
    process.env.CONFIG_SECRET =
      'local-test-config-secret-at-least-32-characters';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
    service = new StaffMfaService(
      prisma as never,
      new CryptoService(),
      passwordHasher as unknown as PasswordHasher,
      audit as unknown as StaffAuditService,
      config as unknown as ConfigService,
    );
  });

  it('prépare un secret TOTP chiffré sans exposer sa valeur en base', async () => {
    prisma.staff.findUnique.mockResolvedValue(staff);

    const result = await service.beginSetup(staff.id, '127.0.0.1');

    expect(result.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(result.otpauthUri).toContain('otpauth://totp/');
    const encrypted = prisma.staff.update.mock.calls[0][0].data.mfaSecret;
    expect(encrypted).toMatch(/^v2:/);
    expect(encrypted).not.toContain(result.secret);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff.mfa.setup_started' }),
    );
  });

  it('active la MFA, crée dix codes hachés et révoque les sessions', async () => {
    const now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    prisma.staff.findUnique.mockResolvedValue(staff);
    const setup = await service.beginSetup(staff.id);
    const encrypted = prisma.staff.update.mock.calls[0][0].data.mfaSecret;
    prisma.staff.findUnique.mockResolvedValue({
      ...staff,
      mfaSecret: encrypted,
    });
    prisma.staff.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.enable(staff.id, totp(setup.secret, now));

    expect(result.recoveryCodes).toHaveLength(10);
    expect(prisma.staffMfaRecoveryCode.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          staffId: staff.id,
          codeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]),
    });
    const persisted = prisma.staffMfaRecoveryCode.createMany.mock.calls[0][0];
    expect(JSON.stringify(persisted)).not.toContain(result.recoveryCodes[0]);
    expect(prisma.staffSession.updateMany).toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('consomme un TOTP une seule fois pour la connexion', async () => {
    const now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    prisma.staff.findUnique.mockResolvedValue(staff);
    const setup = await service.beginSetup(staff.id);
    const encrypted = prisma.staff.update.mock.calls[0][0].data.mfaSecret;
    const enabledStaff = {
      ...staff,
      mfaEnabled: true,
      mfaSecret: encrypted,
    };
    prisma.staff.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const code = totp(setup.secret, now);

    await expect(
      service.verifyLoginSecondFactor(enabledStaff, code),
    ).resolves.toBeUndefined();
    await expect(
      service.verifyLoginSecondFactor(enabledStaff, code),
    ).rejects.toThrow(UnauthorizedException);
    jest.restoreAllMocks();
  });

  it('accepte un code de secours une seule fois', async () => {
    prisma.staffMfaRecoveryCode.updateMany.mockResolvedValue({ count: 1 });
    await service.verifyLoginSecondFactor(
      { ...staff, mfaEnabled: true, mfaSecret: 'unused' },
      'ABCD-EFGH-JKLM',
    );

    expect(prisma.staffMfaRecoveryCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ usedAt: null }),
        data: { usedAt: expect.any(Date) },
      }),
    );
  });

  it('indique que ROOT et ADMIN exigent la MFA', () => {
    expect(service.isRequired(PlatformRole.ROOT)).toBe(true);
    expect(service.isRequired(PlatformRole.ADMIN)).toBe(true);
    expect(service.isRequired(PlatformRole.OPERATOR)).toBe(false);
  });
});
