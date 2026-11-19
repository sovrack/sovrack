import { ConfigService } from '@nestjs/config';
import {
  AUTH_COOKIE_NAME_DEFAULT,
  buildAuthCookieClearOptions,
  buildAuthCookieOptions,
  extractTokenFromCookieHeader,
  resolveAuthCookieName,
} from './auth-cookie.util';

/** Minimal ConfigService stub driven by a plain record. */
function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('auth-cookie.util', () => {
  describe('resolveAuthCookieName', () => {
    it('returns the default when unset', () => {
      expect(resolveAuthCookieName(config({}))).toBe(AUTH_COOKIE_NAME_DEFAULT);
    });
    it('returns the configured name (trimmed)', () => {
      expect(
        resolveAuthCookieName(config({ AUTH_COOKIE_NAME: '  vk_t ' })),
      ).toBe('vk_t');
    });
  });

  describe('extractTokenFromCookieHeader', () => {
    const NAME = 'sovrack_token';
    it('returns null when no header', () => {
      expect(extractTokenFromCookieHeader(undefined, NAME)).toBeNull();
    });
    it('extracts the matching cookie value among several', () => {
      expect(
        extractTokenFromCookieHeader(
          `theme=dark; ${NAME}=abc.def; lang=fr`,
          NAME,
        ),
      ).toBe('abc.def');
    });
    it('falls back to legacy cookie when sovrack_token is absent', () => {
      expect(
        extractTokenFromCookieHeader(
          'theme=dark; deploy_automation_token=legacy.jwt.token; lang=fr',
          NAME,
        ),
      ).toBe('legacy.jwt.token');
    });
    it('URL-decodes the value', () => {
      expect(extractTokenFromCookieHeader(`${NAME}=a%2Bb`, NAME)).toBe('a+b');
    });
    it('joins an array header before parsing', () => {
      expect(
        extractTokenFromCookieHeader(['theme=dark', `${NAME}=tok`], NAME),
      ).toBe('tok');
    });
    it('returns null when the cookie is present but empty', () => {
      expect(extractTokenFromCookieHeader(`${NAME}=`, NAME)).toBeNull();
    });
    it('returns null when the named cookie is absent', () => {
      expect(extractTokenFromCookieHeader('other=1', NAME)).toBeNull();
    });
  });

  describe('buildAuthCookieOptions', () => {
    it('is httpOnly, path=/, sameSite lax by default, secure=false in dev', () => {
      const o = buildAuthCookieOptions(config({}));
      expect(o).toMatchObject({
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: false,
      });
    });
    it('secure=true in production by default', () => {
      expect(
        buildAuthCookieOptions(config({ NODE_ENV: 'production' })).secure,
      ).toBe(true);
    });
    it('sameSite=none forces secure=true', () => {
      const o = buildAuthCookieOptions(
        config({ AUTH_COOKIE_SAME_SITE: 'none' }),
      );
      expect(o.sameSite).toBe('none');
      expect(o.secure).toBe(true);
    });
    it('explicit AUTH_COOKIE_SECURE overrides the NODE_ENV default', () => {
      expect(
        buildAuthCookieOptions(
          config({ AUTH_COOKIE_SECURE: 'false', NODE_ENV: 'production' }),
        ).secure,
      ).toBe(false);
    });
    it('falls back to the default maxAge for an invalid value', () => {
      expect(
        buildAuthCookieOptions(config({ AUTH_COOKIE_MAX_AGE_MS: 'nope' }))
          .maxAge,
      ).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('buildAuthCookieClearOptions', () => {
    it('drops maxAge and sets an epoch expiry', () => {
      const o = buildAuthCookieClearOptions(config({}));
      expect(o.maxAge).toBeUndefined();
      expect(o.expires).toEqual(new Date(0));
      expect(o.httpOnly).toBe(true);
    });
  });
});
