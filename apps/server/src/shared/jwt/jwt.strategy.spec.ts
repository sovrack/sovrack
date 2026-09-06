import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import type { JwtPayloadDto } from './dto/jwt-payload.dto';
import { PrismaService } from '../database/prisma.service';

function buildStrategy(
  user: unknown = {
    email: 'a@b.com',
    isActive: true,
    emailVerifiedAt: new Date(),
    provider: 'email',
    sessionVersion: 0,
  },
): JwtStrategy {
  const config = {
    get: (key: string) =>
      key === 'JWT_SECRET' ? 'test-secret-at-least-32-chars-long!!' : undefined,
  } as unknown as ConfigService;
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
  } as unknown as PrismaService;
  return new JwtStrategy(config, prisma);
}

describe('JwtStrategy', () => {
  it('throws at construction when JWT_SECRET is missing', () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    expect(() => new JwtStrategy(config, {} as PrismaService)).toThrow(
      'JWT_SECRET',
    );
  });

  describe('validate', () => {
    it('returns the payload when id and email are present', async () => {
      const strategy = buildStrategy();
      const payload = {
        id: 'u1',
        email: 'a@b.com',
        role: 'OWNER',
        sessionVersion: 0,
      } as unknown as JwtPayloadDto;
      await expect(strategy.validate(payload)).resolves.toBe(payload);
    });

    it('rejects (401) a payload missing id', async () => {
      const strategy = buildStrategy();
      await expect(
        strategy.validate({ email: 'a@b.com' } as unknown as JwtPayloadDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects (401) a payload missing email', async () => {
      const strategy = buildStrategy();
      await expect(
        strategy.validate({ id: 'u1' } as unknown as JwtPayloadDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token after the account is deactivated', async () => {
      const strategy = buildStrategy({
        email: 'a@b.com',
        isActive: false,
        emailVerifiedAt: new Date(),
        provider: 'email',
        sessionVersion: 0,
      });
      await expect(
        strategy.validate({
          id: 'u1',
          email: 'a@b.com',
          sessionVersion: 0,
        } as JwtPayloadDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token issued before a session revocation', async () => {
      const strategy = buildStrategy({
        email: 'a@b.com',
        isActive: true,
        emailVerifiedAt: new Date(),
        provider: 'email',
        sessionVersion: 2,
      });
      await expect(
        strategy.validate({
          id: 'u1',
          email: 'a@b.com',
          sessionVersion: 1,
        } as JwtPayloadDto),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
