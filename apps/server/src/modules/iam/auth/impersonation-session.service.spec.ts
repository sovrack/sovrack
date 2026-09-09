import { ImpersonationSessionService } from './impersonation-session.service';

describe('ImpersonationSessionService', () => {
  it('audite la fin sans révoquer les sessions du client', async () => {
    const prisma = {
      staffAuditLog: { create: jest.fn().mockResolvedValue({}) },
      staffImpersonationGrant: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { update: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (work: (transaction: unknown) => Promise<unknown>) => work(prisma),
    );
    const service = new ImpersonationSessionService(prisma as never);

    await expect(
      service.logout({
        userId: 'user-1',
        staffId: 'staff-1',
        grantId: 'grant-1',
      }),
    ).resolves.toEqual({ message: "Session d'assistance terminée" });

    expect(prisma.staffAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        staffId: 'staff-1',
        action: 'user.impersonation.logout',
        resourceId: 'user-1',
        afterJson: { grantId: 'grant-1' },
      }),
    });
    expect(prisma.staffImpersonationGrant.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'grant-1',
        userId: 'user-1',
        staffId: 'staff-1',
        endedAt: null,
      }),
      data: { endedAt: expect.any(Date) },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
