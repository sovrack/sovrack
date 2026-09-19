import request from 'supertest';
import { GitProviderType } from '@prisma/client';
import { bootstrapE2E, E2EContext } from '../setup-e2e';
import { createTestFixtures } from '../utils/test-fixtures';
import { CryptoService } from '../../src/shared/crypto/crypto.service';

/**
 * Test 3 — unified webhook ingestion: record, 404 on unknown token, idempotence.
 *
 * NOTE on dedup: the controller dedups the WebhookEvent ROW by externalDeliveryId
 * (a re-delivery does not create a second row), but it still dispatches to the
 * handler each call. We therefore assert the row-level invariant (exactly one
 * WebhookEvent), which is what the code actually guarantees.
 */
describe('Webhook ingestion (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await bootstrapE2E();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.resetDb();
  });

  async function seedEndpoint(): Promise<{
    token: string;
    projectId: string;
    secret: string;
  }> {
    const f = await createTestFixtures(ctx.prisma);
    const secret = 'e2e-gitlab-webhook-secret';
    const crypto = ctx.app.get(CryptoService);
    const endpoint = await ctx.prisma.webhookEndpoint.create({
      data: {
        projectId: f.projectId,
        provider: GitProviderType.GITLAB,
        events: ['push'],
        isActive: true,
        secret: crypto.encrypt(secret),
      },
      select: { webhookToken: true, projectId: true },
    });
    return {
      token: endpoint.webhookToken,
      projectId: endpoint.projectId,
      secret,
    };
  }

  const pushPayload = { object_kind: 'push', ref: 'refs/heads/main' };

  it('scenario 1 — valid token → 202 and a WebhookEvent is recorded', async () => {
    const { token, secret } = await seedEndpoint();

    const res = await request(ctx.app.getHttpServer())
      .post(`/webhooks/incoming/${token}`)
      .set('X-Gitlab-Event', 'Push Hook')
      .set('X-Gitlab-Event-Uuid', 'delivery-1')
      .set('X-Gitlab-Token', secret)
      .send(pushPayload);

    expect(res.status).toBe(202);
    const events = await ctx.prisma.webhookEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0].provider).toBe(GitProviderType.GITLAB);
  });

  it('scenario 2 — unknown token → 404 and no WebhookEvent', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/webhooks/incoming/unknown-token-xyz')
      .send(pushPayload);

    expect(res.status).toBe(404);
    const count = await ctx.prisma.webhookEvent.count();
    expect(count).toBe(0);
  });

  it('scenario 3 — same delivery id twice → 202 and exactly one WebhookEvent (dedup)', async () => {
    const { token, secret } = await seedEndpoint();
    const send = () =>
      request(ctx.app.getHttpServer())
        .post(`/webhooks/incoming/${token}`)
        .set('X-Gitlab-Event', 'Push Hook')
        .set('X-Gitlab-Event-Uuid', 'delivery-dup')
        .set('X-Gitlab-Token', secret)
        .send(pushPayload);

    const first = await send();
    const second = await send();

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    const count = await ctx.prisma.webhookEvent.count();
    expect(count).toBe(1);
  });
});
