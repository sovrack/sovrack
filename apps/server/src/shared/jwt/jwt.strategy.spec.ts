import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import type { JwtPayloadDto } from './dto/jwt-payload.dto';

function buildStrategy(): JwtStrategy {
  const config = {
    get: (key: string) =>
      key === 'JWT_SECRET' ? 'test-secret-at-least-32-chars-long!!' : undefined,
  } as unknown as ConfigService;
  return new JwtStrategy(config);
}

describe('JwtStrategy', () => {
  it('throws at construction when JWT_SECRET is missing', () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    expect(() => new JwtStrategy(config)).toThrow('JWT_SECRET');
  });

  describe('validate', () => {
    it('returns the payload when id and email are present', () => {
      const strategy = buildStrategy();
      const payload = {
        id: 'u1',
        email: 'a@b.com',
        role: 'OWNER',
      } as unknown as JwtPayloadDto;
      expect(strategy.validate(payload)).toBe(payload);
    });

    it('rejects (401) a payload missing id', () => {
      const strategy = buildStrategy();
      expect(() =>
        strategy.validate({ email: 'a@b.com' } as unknown as JwtPayloadDto),
      ).toThrow(UnauthorizedException);
    });

    it('rejects (401) a payload missing email', () => {
      const strategy = buildStrategy();
      expect(() =>
        strategy.validate({ id: 'u1' } as unknown as JwtPayloadDto),
      ).toThrow(UnauthorizedException);
    });
  });
});
