import { BillingJobsService } from './billing-jobs.service';

describe('BillingJobsService', () => {
  function createService(
    overrides: {
      pending?: unknown[];
      overdue?: unknown[];
    } = {},
  ) {
    const invoices = {
      findMany: jest.fn((args: { where: { status: string } }) => {
        if (args.where.status === 'PENDING') {
          return Promise.resolve(overrides.pending ?? []);
        }
        return Promise.resolve(overrides.overdue ?? []);
      }),
    };

    const prisma = {
      invoice: invoices,
    } as never;

    const billingService = {
      markOverdue: jest.fn().mockResolvedValue(undefined),
      markSuspended: jest.fn().mockResolvedValue(undefined),
    } as never;

    const smtp = {
      sendBillingEmail: jest.fn().mockResolvedValue(undefined),
    } as never;

    return {
      svc: new BillingJobsService(prisma, billingService, smtp),
      billingService,
      smtp,
      prisma,
    };
  }

  function makeInvoice(overrides: Record<string, unknown> = {}) {
    return {
      id: 'inv-1',
      teamId: 'team-1',
      amountMillimes: 99000,
      status: 'PENDING',
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      team: {
        name: 'Équipe 1',
        members: [{ user: { email: 'owner@example.com', fullName: 'Owner' } }],
      },
      ...overrides,
    };
  }

  it('escalates PENDING invoices older than 7 days to OVERDUE and notifies', async () => {
    const { svc, billingService, smtp } = createService({
      pending: [makeInvoice()],
    });
    await svc.escalateOverdueInvoices();
    expect(billingService.markOverdue).toHaveBeenCalledWith('inv-1');
    expect(smtp.sendBillingEmail).toHaveBeenCalledWith(
      'owner@example.com',
      'Facture en retard',
      expect.stringContaining('en retard'),
    );
    expect(billingService.markSuspended).not.toHaveBeenCalled();
  });

  it('suspends subscriptions whose OVERDUE invoice is 14+ days old', async () => {
    const { svc, billingService } = createService({
      overdue: [
        makeInvoice({
          status: 'OVERDUE',
          createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        }),
      ],
    });
    await svc.escalateOverdueInvoices();
    expect(billingService.markSuspended).toHaveBeenCalledWith('team-1');
  });

  it('keeps OVERDUE invoices younger than 14 days unsuspended', async () => {
    const { svc, billingService } = createService({
      overdue: [
        makeInvoice({
          status: 'OVERDUE',
          createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        }),
      ],
    });
    await svc.escalateOverdueInvoices();
    expect(billingService.markSuspended).not.toHaveBeenCalled();
  });

  it('does nothing when there is no pending or overdue invoice', async () => {
    const { svc, billingService } = createService();
    await svc.escalateOverdueInvoices();
    expect(billingService.markOverdue).not.toHaveBeenCalled();
    expect(billingService.markSuspended).not.toHaveBeenCalled();
  });
});
