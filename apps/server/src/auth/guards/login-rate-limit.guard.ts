import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

type RateLimitState = {
  count: number;
  windowStart: number;
};

/**
 * Rate limiter simple en mémoire pour limiter les tentatives de login.
 * Note: adapté au dev et mono-instance; en prod distribuée, utiliser Redis.
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, RateLimitState>();
  private readonly maxAttempts = 5;
  private readonly windowMs = 60 * 1000;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const forwardedFor = request.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : (forwardedFor as string | undefined)) ||
      request.ip ||
      'unknown-ip';

    const now = Date.now();
    const state = this.attempts.get(ip);

    if (!state || now - state.windowStart > this.windowMs) {
      this.attempts.set(ip, { count: 1, windowStart: now });
      return true;
    }

    if (state.count >= this.maxAttempts) {
      throw new HttpException(
        'Trop de tentatives de connexion. Réessayez dans 1 minute.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    state.count += 1;
    this.attempts.set(ip, state);
    return true;
  }
}
