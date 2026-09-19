import request from 'supertest';
import { ManagedServiceType, ServiceType } from '@prisma/client';
import { bootstrapE2E, E2EContext } from '../setup-e2e';
import { createTestFixtures } from '../utils/test-fixtures';

describe('Database service (e2e)', () => {
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

  it('creates a PostgreSQL service and reveals credentials only through the dedicated endpoint', async () => {
    const fixture = await createTestFixtures(ctx.prisma);

    const created = await request(ctx.app.getHttpServer())
      .post(`/projects/${fixture.projectId}/services`)
      .set('Cookie', ctx.authCookie(fixture.userId))
      .send({
        name: 'main-database',
        type: ServiceType.DATABASE,
        sourceType: 'NONE',
        databaseType: ManagedServiceType.POSTGRES,
        databaseVersion: '16',
      });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'main-database',
      type: ServiceType.DATABASE,
      databaseType: ManagedServiceType.POSTGRES,
      databaseVersion: '16',
    });
    expect(created.body).not.toHaveProperty('databaseCredentials');
    expect(created.body.envLinks).toHaveLength(1);

    const stored = await ctx.prisma.service.findUniqueOrThrow({
      where: { id: created.body.id as string },
      select: { databaseCredentials: true },
    });
    expect(typeof stored.databaseCredentials).toBe('string');
    expect(stored.databaseCredentials).toMatch(/^v2:/);

    const credentials = await request(ctx.app.getHttpServer())
      .get(
        `/projects/${fixture.projectId}/services/${created.body.id as string}/credentials`,
      )
      .set('Cookie', ctx.authCookie(fixture.userId));

    expect(credentials.status).toBe(200);
    expect(credentials.headers['cache-control']).toContain('no-store');
    expect(credentials.body).toMatchObject({
      serviceId: created.body.id,
      databaseType: ManagedServiceType.POSTGRES,
      internal: {
        user: 'app',
        dbName: 'app',
        host: 'main-database',
        port: 5432,
        connectionUrlEnvKey: 'DATABASE_URL',
      },
      external: { enabled: false, port: null },
    });
    expect(credentials.body.internal.password).toEqual(expect.any(String));
    expect(credentials.body.internal.password.length).toBeGreaterThanOrEqual(
      24,
    );
    expect(credentials.body.internal.connectionUrl).toContain(
      'main-database:5432/app',
    );
  });
});
