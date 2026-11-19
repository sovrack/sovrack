import request from 'supertest';
import { PlatformRole, StaffStatus } from '@prisma/client';
import { bootstrapE2E, E2EContext } from './setup-e2e';
import { PasswordHasher } from '../src/modules/iam/security/password-hasher.service';
import { NotificationsSmtpService } from '../src/modules/notifications/notifications-smtp.service';

describe('Staff password recovery (e2e)', () => {
  let ctx: E2EContext;
  let smtp: { sendTransactionalEmail: jest.Mock };
  const email = 'contact@sovrack.com';
  const oldPassword = 'Old-Staff-Password-2026!';
  const newPassword = 'New-Staff-Password-2026!';

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    smtp = ctx.app.get(NotificationsSmtpService) as unknown as typeof smtp;
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.resetDb();
    jest.clearAllMocks();
    const hasher = ctx.app.get(PasswordHasher);
    await ctx.prisma.staff.create({
      data: {
        email,
        fullName: 'Sovrack Root',
        password: await hasher.hash(oldPassword),
        role: PlatformRole.ROOT,
        status: StaffStatus.ACTIVE,
      },
    });
  });

  it('sends one hashed code, changes the password and revokes old sessions', async () => {
    const loginBefore = await request(ctx.app.getHttpServer())
      .post('/staff/login')
      .send({ email, password: oldPassword })
      .expect(200);
    const oldCookie = loginBefore.headers['set-cookie'];
    expect(oldCookie).toBeDefined();

    await request(ctx.app.getHttpServer())
      .post('/staff/forgot-password')
      .send({ email })
      .expect(200)
      .expect(({ body }) => {
        expect(body.message).toContain('Si ce compte staff existe');
      });

    expect(smtp.sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(smtp.sendTransactionalEmail).toHaveBeenCalledWith(
      email,
      expect.stringContaining('récupération'),
      expect.any(String),
    );
    const html = smtp.sendTransactionalEmail.mock.calls[0][2] as string;
    const code = html.match(/>(\d{8})</)?.[1];
    expect(code).toMatch(/^\d{8}$/);

    const stored = await ctx.prisma.staffPasswordReset.findFirstOrThrow();
    expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.codeHash).not.toBe(code);
    expect(stored.deliveredAt).not.toBeNull();

    await request(ctx.app.getHttpServer())
      .post('/staff/reset-password')
      .send({ email, code: '00000000', password: newPassword })
      .expect(400);
    expect(
      (
        await ctx.prisma.staffPasswordReset.findUniqueOrThrow({
          where: { id: stored.id },
        })
      ).attempts,
    ).toBe(1);

    await request(ctx.app.getHttpServer())
      .post('/staff/reset-password')
      .send({ email, code, password: newPassword })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get('/staff/me')
      .set('Cookie', oldCookie)
      .expect(401);
    await request(ctx.app.getHttpServer())
      .post('/staff/login')
      .send({ email, password: oldPassword })
      .expect(401);
    await request(ctx.app.getHttpServer())
      .post('/staff/login')
      .send({ email, password: newPassword })
      .expect(200)
      .expect('set-cookie', /deploy_staff_token=/);

    await request(ctx.app.getHttpServer())
      .post('/staff/reset-password')
      .send({ email, code, password: oldPassword })
      .expect(400);
  });

  it('does not reveal an unknown staff identity', async () => {
    await request(ctx.app.getHttpServer())
      .post('/staff/forgot-password')
      .send({ email: 'unknown@sovrack.com' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.message).toContain('Si ce compte staff existe');
      });

    expect(smtp.sendTransactionalEmail).not.toHaveBeenCalled();
  });
});
