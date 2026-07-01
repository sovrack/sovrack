import { HttpException } from '@nestjs/common';
import { LoginRateLimitGuard } from './login-rate-limit.guard';

function makeContext(ip: string, forwardedFor?: string | string[]) {
  const headers: Record<string, string | string[]> = {};
  if (forwardedFor !== undefined) {
    headers['x-forwarded-for'] = forwardedFor;
  }
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, ip }),
    }),
  } as never;
}

describe('LoginRateLimitGuard', () => {
  it('allows first request from a new IP', () => {
    const guard = new LoginRateLimitGuard();
    expect(guard.canActivate(makeContext('1.2.3.4'))).toBe(true);
  });

  it('allows up to maxAttempts (5) from same IP within window', () => {
    const guard = new LoginRateLimitGuard();
    for (let i = 0; i < 5; i++) {
      expect(guard.canActivate(makeContext('1.2.3.4'))).toBe(true);
    }
  });

  it('throws HttpException (429) after 5 attempts from same IP', () => {
    const guard = new LoginRateLimitGuard();
    for (let i = 0; i < 5; i++) {
      guard.canActivate(makeContext('5.5.5.5'));
    }
    expect(() => guard.canActivate(makeContext('5.5.5.5'))).toThrow(HttpException);
    expect(() => guard.canActivate(makeContext('5.5.5.5'))).toThrow('Trop de tentatives');
  });

  it('does not affect a different IP', () => {
    const guard = new LoginRateLimitGuard();
    for (let i = 0; i < 5; i++) {
      guard.canActivate(makeContext('9.9.9.9'));
    }
    expect(guard.canActivate(makeContext('8.8.8.8'))).toBe(true);
  });

  it('extracts IP from x-forwarded-for string header', () => {
    const guard = new LoginRateLimitGuard();
    expect(guard.canActivate(makeContext('unknown', '10.0.0.1'))).toBe(true);
  });

  it('extracts first IP from x-forwarded-for array header', () => {
    const guard = new LoginRateLimitGuard();
    expect(guard.canActivate(makeContext('unknown', ['10.0.0.2', '10.0.0.3']))).toBe(true);
  });

  it('falls back to request.ip when no forwarded header is present', () => {
    const guard = new LoginRateLimitGuard();
    expect(guard.canActivate(makeContext('192.168.1.1'))).toBe(true);
  });

  it('resets counter when window expires', () => {
    jest.useFakeTimers();
    const guard = new LoginRateLimitGuard();
    const ip = '2.2.2.2';
    for (let i = 0; i < 5; i++) {
      guard.canActivate(makeContext(ip));
    }
    jest.advanceTimersByTime(61_000);
    expect(guard.canActivate(makeContext(ip))).toBe(true);
    jest.useRealTimers();
  });
});
