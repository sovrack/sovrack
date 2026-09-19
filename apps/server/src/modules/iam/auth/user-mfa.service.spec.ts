import { UnauthorizedException } from '@nestjs/common';
import { UserMfaService } from './user-mfa.service';

function build(userOverrides: Record<string, unknown> = {}) {
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    isActive: true,
    mfaEnabled: false,
    mfaSecret: null,
    ...userOverrides,
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    userMfaRecoveryCode: {
      count: jest.fn().mockResolvedValue(7),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as never;
  const service = new UserMfaService(
    prisma,
    { encrypt: jest.fn(), decrypt: jest.fn() } as never,
    { verify: jest.fn() } as never,
    { record: jest.fn() } as never,
    { getOrThrow: jest.fn().mockReturnValue('x'.repeat(48)) } as never,
  );
  return { service, prisma };
}

describe('UserMfaService', () => {
  it('keeps MFA optional for a normal customer account', async () => {
    const { service } = build();
    await expect(
      service.verifyLoginSecondFactor({
        id: 'user-1',
        email: 'user@example.com',
        isActive: true,
        mfaEnabled: false,
        mfaSecret: null,
      }),
    ).resolves.toBeUndefined();
  });

  it('requests a second factor only after the customer enabled MFA', async () => {
    const { service } = build({
      mfaEnabled: true,
      mfaSecret: 'encrypted-secret',
    });
    await expect(
      service.verifyLoginSecondFactor({
        id: 'user-1',
        email: 'user@example.com',
        isActive: true,
        mfaEnabled: true,
        mfaSecret: 'encrypted-secret',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'USER_MFA_REQUIRED' }),
    } satisfies Partial<UnauthorizedException>);
  });

  it('reports that the policy is never mandatory for customers', async () => {
    const { service, prisma } = build({ mfaEnabled: true });
    await expect(service.status('user-1')).resolves.toEqual({
      enabled: true,
      required: false,
      recoveryCodesRemaining: 7,
    });
    expect(prisma.userMfaRecoveryCode.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', usedAt: null },
    });
  });
});
