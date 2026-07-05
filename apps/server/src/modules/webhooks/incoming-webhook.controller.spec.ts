import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { GitProviderType } from '@prisma/client';
import { IncomingWebhookController } from './incoming-webhook.controller';
import type { WebhooksService } from './webhooks.service';
import type { WebhookEndpointContext } from './interfaces/webhook-handler.interface';

/**
 * Security gate of the PUBLIC webhook endpoint: signature verification.
 * GitLab → constant-time X-Gitlab-Token compare; GitHub → HMAC-SHA256 of the
 * raw body. A wrong signature must NOT be accepted; a legacy endpoint (no
 * stored secret) is accepted for backward-compat.
 */
describe('IncomingWebhookController.verifySignature', () => {
  const controller = new IncomingWebhookController(
    {} as unknown as WebhooksService,
    [],
  );
  const verify = (
    endpoint: Partial<WebhookEndpointContext>,
    rawBody: Buffer | undefined,
    headers: Record<string, string | string[] | undefined>,
  ): { verified: boolean; error?: string } =>
    (
      controller as unknown as {
        verifySignature: (
          e: Partial<WebhookEndpointContext>,
          b: Buffer | undefined,
          h: Record<string, string | string[] | undefined>,
        ) => { verified: boolean; error?: string };
      }
    ).verifySignature(endpoint, rawBody, headers);

  it('accepts a legacy endpoint without a stored secret', () => {
    expect(verify({ secret: null }, undefined, {}).verified).toBe(true);
  });

  describe('GitLab (X-Gitlab-Token)', () => {
    const ep = { secret: 'shh', provider: GitProviderType.GITLAB };
    it('accepts the matching token', () => {
      expect(verify(ep, undefined, { 'x-gitlab-token': 'shh' }).verified).toBe(
        true,
      );
    });
    it('rejects a wrong token', () => {
      const r = verify(ep, undefined, { 'x-gitlab-token': 'nope' });
      expect(r.verified).toBe(false);
    });
    it('rejects a missing token (no throw on length mismatch)', () => {
      expect(verify(ep, undefined, {}).verified).toBe(false);
    });
  });

  describe('GitHub (HMAC X-Hub-Signature-256)', () => {
    const secret = 'webhook-secret';
    const ep = { secret, provider: GitProviderType.GITHUB };
    const body = Buffer.from('{"ref":"refs/heads/main"}');
    const sign = (b: Buffer, s: string) =>
      'sha256=' + createHmac('sha256', s).update(b).digest('hex');

    it('accepts a valid HMAC over the raw body', () => {
      const r = verify(ep, body, { 'x-hub-signature-256': sign(body, secret) });
      expect(r.verified).toBe(true);
    });
    it('rejects an HMAC computed with the wrong secret', () => {
      const r = verify(ep, body, {
        'x-hub-signature-256': sign(body, 'wrong'),
      });
      expect(r.verified).toBe(false);
    });
    it('rejects when the raw body is unavailable', () => {
      const r = verify(ep, undefined, { 'x-hub-signature-256': 'sha256=x' });
      expect(r.verified).toBe(false);
    });
  });
});

// ─── handle() integration scenarios ─────────────────────────────────────────

function makeEndpoint(
  opts: {
    isActive?: boolean;
    provider?: GitProviderType;
    secret?: string | null;
  } = {},
) {
  return {
    id: 'ep1',
    isActive: opts.isActive ?? true,
    provider: opts.provider ?? GitProviderType.GITLAB,
    secret: opts.secret !== undefined ? opts.secret : null,
    projectId: 'proj1',
  };
}

function makeSvcFull(
  opts: {
    endpoint?: ReturnType<typeof makeEndpoint> | null;
    recordError?: boolean;
  } = {},
) {
  return {
    findByToken: jest
      .fn()
      .mockResolvedValue(
        opts.endpoint !== undefined ? opts.endpoint : makeEndpoint(),
      ),
    record: opts.recordError
      ? jest.fn().mockRejectedValue(new Error('db error'))
      : jest.fn().mockResolvedValue({ id: 'evt1' }),
    markProcessed: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
}

function makeHandler(provider: GitProviderType = GitProviderType.GITLAB) {
  return {
    provider,
    handleIncoming: jest.fn().mockResolvedValue({ status: 'ok' }),
  };
}

describe('IncomingWebhookController.handle', () => {
  it('throws NotFoundException when endpoint not found', async () => {
    const svc = makeSvcFull({ endpoint: null });
    const ctrl = new IncomingWebhookController(svc as never, []);
    await expect(
      ctrl.handle('bad-token', {}, {}, { rawBody: Buffer.from('{}') } as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns ignored when endpoint is paused', async () => {
    const svc = makeSvcFull({ endpoint: makeEndpoint({ isActive: false }) });
    const ctrl = new IncomingWebhookController(svc as never, []);
    const result = await ctrl.handle('tok', {}, {}, {
      rawBody: Buffer.from('{}'),
    } as never);
    expect(result).toEqual({ status: 'ignored' });
  });

  it('passes through when no secret stored (legacy endpoint)', async () => {
    const handler = makeHandler();
    const svc = makeSvcFull({ endpoint: makeEndpoint({ secret: null }) });
    const ctrl = new IncomingWebhookController(svc as never, [handler]);
    const result = await ctrl.handle('tok', {}, {}, {
      rawBody: Buffer.from('{}'),
    } as never);
    expect(result).toEqual({ status: 'ok' });
  });

  it('throws UnauthorizedException for wrong GitLab token', async () => {
    const svc = makeSvcFull({
      endpoint: makeEndpoint({
        secret: 'real',
        provider: GitProviderType.GITLAB,
      }),
    });
    const ctrl = new IncomingWebhookController(svc as never, [makeHandler()]);
    await expect(
      ctrl.handle('tok', {}, { 'x-gitlab-token': 'wrong' }, {
        rawBody: Buffer.from('{}'),
      } as never),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('marks event processed after successful dispatch', async () => {
    const handler = makeHandler();
    const svc = makeSvcFull();
    const ctrl = new IncomingWebhookController(svc as never, [handler]);
    await ctrl.handle('tok', {}, {}, { rawBody: Buffer.from('{}') } as never);
    expect(svc.markProcessed).toHaveBeenCalledWith('evt1');
  });

  it('marks event failed and returns ok when dispatch throws', async () => {
    const handler = makeHandler();
    (handler.handleIncoming as jest.Mock).mockRejectedValue(
      new Error('dispatch error'),
    );
    const svc = makeSvcFull();
    const ctrl = new IncomingWebhookController(svc as never, [handler]);
    const result = await ctrl.handle('tok', {}, {}, {
      rawBody: Buffer.from('{}'),
    } as never);
    expect(result).toEqual({ status: 'ok' });
    expect(svc.markFailed).toHaveBeenCalledWith('evt1', 'dispatch error');
  });

  it('continues when record fails (best-effort) and still dispatches', async () => {
    const handler = makeHandler();
    const svc = makeSvcFull({ recordError: true });
    const ctrl = new IncomingWebhookController(svc as never, [handler]);
    const result = await ctrl.handle('tok', {}, {}, {
      rawBody: Buffer.from('{}'),
    } as never);
    expect(result).toEqual({ status: 'ok' });
    expect(handler.handleIncoming).toHaveBeenCalled();
  });

  it('returns ok (no crash) when no handler registered', async () => {
    const svc = makeSvcFull({
      endpoint: makeEndpoint({ provider: GitProviderType.GITLAB }),
    });
    const ctrl = new IncomingWebhookController(svc as never, []);
    const result = await ctrl.handle('tok', {}, {}, {
      rawBody: Buffer.from('{}'),
    } as never);
    expect(result).toEqual({ status: 'ok' });
  });

  it('extracts GitLab object_kind as eventType', async () => {
    const handler = makeHandler();
    const svc = makeSvcFull();
    const ctrl = new IncomingWebhookController(svc as never, [handler]);
    await ctrl.handle('tok', { object_kind: 'push' }, {}, {
      rawBody: Buffer.from('{}'),
    } as never);
    expect(svc.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'push' }),
    );
  });

  it('extracts GitHub action as eventType', async () => {
    const handler = makeHandler(GitProviderType.GITHUB);
    const svc = makeSvcFull({
      endpoint: makeEndpoint({ provider: GitProviderType.GITHUB }),
    });
    const ctrl = new IncomingWebhookController(svc as never, [handler]);
    await ctrl.handle('tok', { action: 'synchronize' }, {}, {
      rawBody: Buffer.from('{}'),
    } as never);
    expect(svc.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'synchronize' }),
    );
  });
});
