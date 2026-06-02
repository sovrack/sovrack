import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

type RateLimitState = {
  count: number;
  windowStart: number;
};

/**
 * Rate limiter login par IP.
 * En développement et single-instance: en mémoire.
 * Pour production multi-pod: remplacer par throttler Redis (@nestjs/throttler + ThrottlerStorageRedisService).
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, RateLimitState>();
  private readonly maxAttempts = 5;
  private readonly windowMs = 60 * 1000;
  private lastCleanup = Date.now();
  private readonly cleanupIntervalMs = 5 * 60 * 1000;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const forwardedFor = request.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) ??
      request.ip ??
      'unknown-ip';

    this.cleanupExpiredEntries();

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

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupIntervalMs) return;
    this.lastCleanup = now;
    for (const [ip, state] of this.attempts.entries()) {
      if (now - state.windowStart > this.windowMs) {
        this.attempts.delete(ip);
      }
    }
  }
}
