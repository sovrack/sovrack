import request from 'supertest';
import { bootstrapE2E, E2EContext } from '../setup-e2e';
import { createTestFixtures } from '../utils/test-fixtures';

/**
 * T9 backend — GET /deployments/preview-env returns the resolved variables with
 * provenance, masking secrets, and surfaces resolution warnings.
 */
describe('Preview env (e2e)', () => {
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

  it('returns merged variables with origin + masked secrets', async () => {
    const f = await createTestFixtures(ctx.prisma);
    await ctx.prisma.service.update({
      where: { id: f.serviceId },
      data: { env: JSON.stringify({ NODE_ENV: 'production' }), secretsEnv: JSON.stringify({ DB_PASSWORD: 'super-secret' }) },
    });
    await ctx.prisma.serviceEnvironment.update({
      where: { id: f.serviceEnvId },
      data: { env: JSON.stringify({ NODE_ENV: 'staging' }) },
    });

    const res = await request(ctx.app.getHttpServer())
      .get('/deployments/preview-env')
      .query({ serviceEnvId: f.serviceEnvId })
      .set('Cookie', ctx.authCookie(f.userId));

    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(
      (res.body.variables as Array<{ key: string }>).map((v) => [v.key, v]),
    );

    // serviceEnvironment overrides service for NODE_ENV
    expect(byKey.NODE_ENV.value).toBe('staging');
    expect(byKey.NODE_ENV.origin).toBe('serviceEnvironment');
    expect(byKey.NODE_ENV.isSecret).toBe(false);

    // secret is masked
    expect(byKey.DB_PASSWORD.isSecret).toBe(true);
    expect(byKey.DB_PASSWORD.value).toBe('[REDACTED]');

    expect(res.body.warnings).toEqual([]);
  });

  it('reports a warning for malformed JSON instead of failing', async () => {
    const f = await createTestFixtures(ctx.prisma);
    await ctx.prisma.serviceEnvironment.update({
      where: { id: f.serviceEnvId },
      data: { env: '{ not valid json' },
    });

    const res = await request(ctx.app.getHttpServer())
      .get('/deployments/preview-env')
      .query({ serviceEnvId: f.serviceEnvId })
      .set('Cookie', ctx.authCookie(f.userId));

    expect(res.status).toBe(200);
    expect(res.body.warnings.length).toBeGreaterThan(0);
    expect(res.body.warnings[0]).toContain('serviceEnvironment.env');
  });
});
