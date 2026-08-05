import request from 'supertest';
import { Role } from '@prisma/client';
import { bootstrapE2E, E2EContext } from '../setup-e2e';

/**
 * Public registration with email verification (A2):
 *  - register only creates a pending account (no team, no billing, no login)
 *  - verification creates team + subscription and logs the user in
 *  - a wrong code is rejected
 */
describe('Email verification registration (e2e)', () => {
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

  const email = 'new@visitor.test';
  const registerPayload = {
    email,
    password: 'StrongPass123!',
    fullName: 'Jane Visitor',
    teamName: 'Visitor GmbH',
  };

  it('register creates a pending account, without team or billing', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send(registerPayload)
      .expect(201);
    expect(res.body).toEqual({ email });

    const pending = await ctx.prisma.user.findUnique({ where: { email } });
    expect(pending).not.toBeNull();
    expect(pending!.emailVerificationCode).toMatch(/^\d{6}$/);
    expect(pending!.emailVerifiedAt).toBeNull();
    expect(pending!.role).toBe(Role.OWNER);

    expect(await ctx.prisma.team.count()).toBe(0);
    expect(await ctx.prisma.subscription.count()).toBe(0);
  });

  it('cannot log in before verification (account is inactive)', async () => {
    await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send(registerPayload)
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: registerPayload.password })
      .expect(401);
  });

  it('rejects a wrong verification code', async () => {
    await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send(registerPayload)
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post('/auth/verify-email')
      .send({ email, code: '000000' })
      .expect(400);
    const pending = await ctx.prisma.user.findUnique({ where: { email } });
    expect(pending!.emailVerifiedAt).toBeNull();
  });

  it('verifies the code, creates team + subscription and returns a JWT cookie', async () => {
    await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send(registerPayload)
      .expect(201);

    const pending = await ctx.prisma.user.findUnique({ where: { email } });
    const code = pending!.emailVerificationCode!;

    const verify = await request(ctx.app.getHttpServer())
      .post('/auth/verify-email')
      .send({ email, code })
      .expect(201);

    expect(verify.body.access_token).toBeDefined();
    expect(verify.headers['set-cookie']).toBeDefined();
    expect(verify.body.user.email).toBe(email);
    expect(verify.body.user.password).toBeUndefined();
    expect(verify.body.user.role).toBe(Role.OWNER);

    const activated = await ctx.prisma.user.findUnique({ where: { email } });
    expect(activated!.emailVerifiedAt).not.toBeNull();

    const team = await ctx.prisma.team.findFirst({
      where: { name: 'Jane Team' },
    });
    expect(team).not.toBeNull();
    expect(
      await ctx.prisma.subscription.findFirst({
        where: { teamId: team!.id },
      }),
    ).not.toBeNull();
  });

  it('resend-code issues a fresh code', async () => {
    await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send(registerPayload)
      .expect(201);

    const before = await ctx.prisma.user.findUnique({ where: { email } });
    const oldCode = before!.emailVerificationCode;
    const expiryBefore = before!.emailVerificationExpiresAt;

    await request(ctx.app.getHttpServer())
      .post('/auth/resend-code')
      .send({ email })
      .expect(201);

    const after = await ctx.prisma.user.findUnique({ where: { email } });
    expect(after!.emailVerificationCode).toBeDefined();
    expect(after!.emailVerificationCode).not.toBe(oldCode);
    expect(after!.emailVerificationExpiresAt!.getTime()).toBeGreaterThan(
      expiryBefore!.getTime(),
    );
  });
});
