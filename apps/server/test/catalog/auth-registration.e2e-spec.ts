import request from 'supertest';
import { Role, WorkspaceRole, WorkspaceType } from '@prisma/client';
import { bootstrapE2E, E2EContext } from '../setup-e2e';
import { CryptoService } from '../../src/shared/crypto/crypto.service';

/**
 * Public registration with email verification (A2):
 *  - register only creates a pending account (no team, no billing, no login)
 *  - verification creates the workspace + OWNER membership and logs the user in
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
    workspaceType: WorkspaceType.ORGANIZATION,
    workspaceName: 'Visitor GmbH',
  };

  it('register creates a pending account, without team or billing', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send(registerPayload)
      .expect(201);
    expect(res.body).toEqual({
      email,
      registrationId: expect.any(String),
    });

    const pending = await ctx.prisma.user.findUnique({ where: { email } });
    expect(pending).not.toBeNull();
    expect(pending!.emailVerificationCode).toMatch(/^v2:/);
    expect(pending!.emailVerificationAttemptId).toBe(res.body.registrationId);
    expect(pending!.emailVerifiedAt).toBeNull();
    expect(pending!.role).toBe(Role.MEMBER);

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

  it('rejects a wrong code, then creates the requested organization with the valid code', async () => {
    const registration = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send(registerPayload)
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post('/auth/verify-email')
      .send({
        email,
        code: '000000',
        registrationId: registration.body.registrationId,
      })
      .expect(400);
    const pending = await ctx.prisma.user.findUnique({ where: { email } });
    expect(pending!.emailVerifiedAt).toBeNull();
    const crypto = ctx.app.get(CryptoService);
    const code = (
      JSON.parse(crypto.decrypt(pending!.emailVerificationCode!)) as {
        code: string;
      }
    ).code;

    const verify = await request(ctx.app.getHttpServer())
      .post('/auth/verify-email')
      .send({
        email,
        code,
        registrationId: registration.body.registrationId,
      })
      .expect(200);

    expect(verify.body.access_token).toBeUndefined();
    expect(verify.headers['set-cookie']).toBeDefined();
    expect(verify.body.user.email).toBe(email);
    expect(verify.body.user.password).toBeUndefined();
    expect(verify.body.user.role).toBe(Role.MEMBER);

    const activated = await ctx.prisma.user.findUnique({ where: { email } });
    expect(activated!.emailVerifiedAt).not.toBeNull();

    const team = await ctx.prisma.team.findFirst({
      where: { name: registerPayload.workspaceName },
      include: { organizationProfile: true },
    });
    expect(team).not.toBeNull();
    expect(team!.type).toBe(WorkspaceType.ORGANIZATION);
    expect(team!.personalOwnerId).toBeNull();
    expect(team!.organizationProfile).not.toBeNull();
    const membership = await ctx.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: team!.id, userId: activated!.id } },
    });
    expect(membership?.role).toBe(WorkspaceRole.OWNER);
    expect(await ctx.prisma.subscription.count()).toBe(0);
  });

  it('creates one single-user personal workspace when that identity is chosen', async () => {
    const personalEmail = 'personal@visitor.test';
    const registration = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({
        email: personalEmail,
        password: registerPayload.password,
        fullName: 'Solo Builder',
        workspaceType: WorkspaceType.PERSONAL,
      })
      .expect(201);

    const pending = await ctx.prisma.user.findUniqueOrThrow({
      where: { email: personalEmail },
    });
    const crypto = ctx.app.get(CryptoService);
    const code = (
      JSON.parse(crypto.decrypt(pending.emailVerificationCode!)) as {
        code: string;
      }
    ).code;

    await request(ctx.app.getHttpServer())
      .post('/auth/verify-email')
      .send({
        email: personalEmail,
        code,
        registrationId: registration.body.registrationId,
      })
      .expect(200);

    const workspace = await ctx.prisma.team.findUnique({
      where: { personalOwnerId: pending.id },
      include: { members: true, organizationProfile: true },
    });
    expect(workspace).not.toBeNull();
    expect(workspace!.type).toBe(WorkspaceType.PERSONAL);
    expect(workspace!.members).toHaveLength(1);
    expect(workspace!.members[0].role).toBe(WorkspaceRole.OWNER);
    expect(workspace!.organizationProfile).toBeNull();
  });

  it('resend-code issues a fresh code', async () => {
    const registration = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send(registerPayload)
      .expect(201);

    const before = await ctx.prisma.user.findUnique({ where: { email } });
    const crypto = ctx.app.get(CryptoService);
    const oldCode = (
      JSON.parse(crypto.decrypt(before!.emailVerificationCode!)) as {
        code: string;
      }
    ).code;
    const expiryBefore = before!.emailVerificationExpiresAt;

    await request(ctx.app.getHttpServer())
      .post('/auth/resend-code')
      .send({ email, registrationId: registration.body.registrationId })
      .expect(201);

    const after = await ctx.prisma.user.findUnique({ where: { email } });
    const newCode = (
      JSON.parse(crypto.decrypt(after!.emailVerificationCode!)) as {
        code: string;
      }
    ).code;
    expect(newCode).toMatch(/^\d{6}$/);
    expect(newCode).not.toBe(oldCode);
    expect(after!.emailVerificationExpiresAt!.getTime()).toBeGreaterThan(
      expiryBefore!.getTime(),
    );
  });
});
