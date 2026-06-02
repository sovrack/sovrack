import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';

export const AUTH_COOKIE_NAME_DEFAULT = 'devops_platform_token';
const AUTH_COOKIE_MAX_AGE_MS_DEFAULT = 24 * 60 * 60 * 1000;

type SameSiteValue = 'lax' | 'strict' | 'none';

function parseBoolean(value: string | undefined): boolean | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return null;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function normalizeSameSite(value: string | undefined): SameSiteValue {
  if (!value) {
    return 'lax';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'strict' || normalized === 'none') {
    return normalized;
  }

  return 'lax';
}

export function resolveAuthCookieName(configService: ConfigService): string {
  return (
    configService.get<string>('AUTH_COOKIE_NAME')?.trim() ||
    AUTH_COOKIE_NAME_DEFAULT
  );
}

export function buildAuthCookieOptions(
  configService: ConfigService,
): CookieOptions {
  const configuredSecure = parseBoolean(
    configService.get<string>('AUTH_COOKIE_SECURE'),
  );
  const sameSite = normalizeSameSite(
    configService.get<string>('AUTH_COOKIE_SAME_SITE'),
  );
  const secure =
    configuredSecure ?? configService.get<string>('NODE_ENV') === 'production';
  const maxAge = parsePositiveInteger(
    configService.get<string>('AUTH_COOKIE_MAX_AGE_MS'),
    AUTH_COOKIE_MAX_AGE_MS_DEFAULT,
  );
  const domain = configService.get<string>('AUTH_COOKIE_DOMAIN')?.trim();

  return {
    httpOnly: true,
    secure: sameSite === 'none' ? true : secure,
    sameSite,
    path: '/',
    maxAge,
    ...(domain ? { domain } : {}),
  };
}

export function buildAuthCookieClearOptions(
  configService: ConfigService,
): CookieOptions {
  const base = buildAuthCookieOptions(configService);
  const { maxAge, ...rest } = base;
  void maxAge;

  return {
    ...rest,
    expires: new Date(0),
  };
}

export function extractTokenFromCookieHeader(
  cookieHeader: string | string[] | undefined,
  cookieName: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const source = Array.isArray(cookieHeader)
    ? cookieHeader.join('; ')
    : cookieHeader;

  const pairs = source.split(';');
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = pair.slice(0, separatorIndex).trim();
    if (key !== cookieName) {
      continue;
    }

    const value = pair.slice(separatorIndex + 1).trim();
    if (!value) {
      return null;
    }

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}
