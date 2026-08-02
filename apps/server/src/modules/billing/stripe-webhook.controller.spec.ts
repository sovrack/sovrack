import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { StripeWebhookController } from './stripe-webhook.controller';

const SECRET = 'whsec_test_secret_12345';

function sign(payload: string, secret = SECRET): string {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signed = `${timestamp}.${payload}`;
  const sig = createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

function makeController(
  overrides: {
    configSecret?: string;
    prisma?: Record<string, unknown>;
    billing?: Record<string, unknown>;
  } = {},
) {
  const prisma = {
    invoice: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    subscription: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    ...(overrides.prisma ?? {}),
  } as never;

  const billing = {
    markPaid: jest.fn().mockResolvedValue(undefined),
    markOverdue: jest.fn().mockResolvedValue(undefined),
    reactivate: jest.fn().mockResolvedValue(undefined),
    ...(overrides.billing ?? {}),
  } as never;

  const configService = {
    get: jest
      .fn()
      .mockReturnValue(
        overrides.configSecret !== undefined ? overrides.configSecret : SECRET,
      ),
  } as never;

  return {
    ctrl: new StripeWebhookController(billing, prisma, configService),
    prisma,
    billing,
  };
}

function makeEvent(type: string, object: Record<string, unknown>) {
  return JSON.stringify({ type, data: { object } });
}

describe('StripeWebhookController', () => {
  it('rejects when no webhook secret is configured', async () => {
    const { ctrl } = makeController({ configSecret: '' });
    await expect(
      ctrl.handleWebhook({ rawBody: Buffer.from('{}') } as never, 't=1,v1=x'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('rejects a request without a signature header', async () => {
    const { ctrl } = makeController();
    await expect(
      ctrl.handleWebhook({ rawBody: Buffer.from('{}') } as never, undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an invalid signature', async () => {
    const { ctrl } = makeController();
    const payload = makeEvent('invoice.paid', { id: 'in_123' });
    await expect(
      ctrl.handleWebhook(
        { rawBody: Buffer.from(payload) } as never,
        't=1,v1=deadbeef',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('marks the local invoice PAID by stripe id', async () => {
    const { ctrl, billing, prisma } = makeController({
      prisma: {
        invoice: {
          findFirst: jest.fn().mockResolvedValue({ id: 'local-inv' }),
        },
        subscription: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    });
    const payload = makeEvent('invoice.paid', { id: 'in_123' });
    const result = await ctrl.handleWebhook(
      { rawBody: Buffer.from(payload) } as never,
      sign(payload),
    );
    expect(result).toEqual({ received: true });
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
      where: { stripeInvoiceId: 'in_123' },
    });
    expect(billing.markPaid).toHaveBeenCalledWith('local-inv', 'in_123');
  });

  it('matches by team metadata and reactivates the subscription', async () => {
    const { ctrl, billing } = makeController({
      prisma: {
        invoice: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValue({ id: 'pending-inv' }),
        },
        subscription: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    });
    const payload = makeEvent('invoice.paid', {
      id: 'in_456',
      metadata: { teamId: 'team-9' },
    });
    await ctrl.handleWebhook(
      { rawBody: Buffer.from(payload) } as never,
      sign(payload),
    );
    expect(billing.markPaid).toHaveBeenCalledWith('pending-inv', 'in_456');
    expect(billing.reactivate).toHaveBeenCalledWith('team-9');
  });

  it('marks OVERDUE on payment failure', async () => {
    const { ctrl, billing } = makeController({
      prisma: {
        invoice: {
          findFirst: jest.fn().mockResolvedValue({ id: 'local-inv' }),
        },
        subscription: { findFirst: jest.fn().mockResolvedValue(null) },
      },
    });
    const payload = makeEvent('invoice.payment_failed', { id: 'in_789' });
    await ctrl.handleWebhook(
      { rawBody: Buffer.from(payload) } as never,
      sign(payload),
    );
    expect(billing.markOverdue).toHaveBeenCalledWith('local-inv');
  });

  it('cancels the subscription on subscription.deleted', async () => {
    const { ctrl, prisma } = makeController({
      prisma: {
        invoice: { findFirst: jest.fn().mockResolvedValue(null) },
        subscription: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'sub-1',
            teamId: 'team-1',
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      },
    });
    const payload = makeEvent('customer.subscription.deleted', {
      id: 'sub_stripe_1',
    });
    await ctrl.handleWebhook(
      { rawBody: Buffer.from(payload) } as never,
      sign(payload),
    );
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { status: 'CANCELED', canceledAt: expect.any(Date) },
    });
  });

  it('ignores unknown event types', async () => {
    const { ctrl, billing } = makeController();
    const payload = makeEvent('ping', {});
    const result = await ctrl.handleWebhook(
      { rawBody: Buffer.from(payload) } as never,
      sign(payload),
    );
    expect(result).toEqual({ received: true });
    expect(billing.markPaid).not.toHaveBeenCalled();
  });
});
