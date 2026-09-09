import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';

/** Cookie dédié au back-office — isolé de la session client. */
export const STAFF_AUTH_COOKIE_NAME_DEFAULT = 'deploy_staff_token';
const STAFF_AUTH_COOKIE_MAX_AGE_MS_DEFAULT = 12 * 60 * 60 * 1000; // 12h

type SameSiteValue = 'lax' | 'strict' | 'none';

function parseBoolean(value: string | undefined): boolean | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return null;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function normalizeSameSite(value: string | undefined): SameSiteValue {
  if (!value) return 'lax';
  const v = value.trim().toLowerCase();
  if (v === 'strict' || v === 'none') return v;
  return 'lax';
}

export function resolveStaffAuthCookieName(
  configService: ConfigService,
): string {
  return (
    configService.get<string>('STAFF_AUTH_COOKIE_NAME')?.trim() ||
    STAFF_AUTH_COOKIE_NAME_DEFAULT
  );
}

export function buildStaffAuthCookieOptions(
  configService: ConfigService,
): CookieOptions {
  const configuredSecure = parseBoolean(
    configService.get<string>('STAFF_AUTH_COOKIE_SECURE'),
  );
  const sameSite = normalizeSameSite(
    configService.get<string>('STAFF_AUTH_COOKIE_SAME_SITE'),
  );
  const secure =
    configuredSecure ?? configService.get<string>('NODE_ENV') === 'production';
  const maxAge = parsePositiveInteger(
    configService.get<string>('STAFF_AUTH_COOKIE_MAX_AGE_MS'),
    STAFF_AUTH_COOKIE_MAX_AGE_MS_DEFAULT,
  );
  // Host-only by default. Never inherit the customer cookie domain: sharing a
  // staff session with the public site or customer console breaks plane
  // isolation.
  const domain = configService.get<string>('STAFF_AUTH_COOKIE_DOMAIN')?.trim();

  return {
    httpOnly: true,
    secure: sameSite === 'none' ? true : secure,
    sameSite,
    path: '/',
    maxAge,
    ...(domain ? { domain } : {}),
  };
}

export function buildStaffAuthCookieClearOptions(
  configService: ConfigService,
): CookieOptions {
  const base = buildStaffAuthCookieOptions(configService);
  const { maxAge, ...rest } = base;
  void maxAge;
  return { ...rest, expires: new Date(0) };
}
