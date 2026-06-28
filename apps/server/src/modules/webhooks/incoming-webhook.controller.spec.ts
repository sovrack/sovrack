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
