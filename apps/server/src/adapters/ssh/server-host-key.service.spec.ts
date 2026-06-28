import { ConfigService } from '@nestjs/config';
import { resolve } from 'path';
import { ServerHostKeyService } from './server-host-key.service';

function build(values: Record<string, string> = {}): ServerHostKeyService {
  const config = {
    get: (key: string, def?: string) => values[key] ?? def,
  } as unknown as ConfigService;
  return new ServerHostKeyService(config);
}

describe('ServerHostKeyService', () => {
  describe('resolveStrictHostKeyChecking', () => {
    it('returns a valid configured value', () => {
      expect(
        build({
          ANSIBLE_STRICT_HOST_KEY_CHECKING: 'yes',
        }).resolveStrictHostKeyChecking(),
      ).toBe('yes');
      expect(
        build({
          ANSIBLE_STRICT_HOST_KEY_CHECKING: 'NO',
        }).resolveStrictHostKeyChecking(),
      ).toBe('no');
    });

    it('defaults to accept-new in development', () => {
      expect(
        build({ NODE_ENV: 'development' }).resolveStrictHostKeyChecking(),
      ).toBe('accept-new');
    });

    it('defaults to yes (strict) in production on an invalid value', () => {
      expect(
        build({
          ANSIBLE_STRICT_HOST_KEY_CHECKING: 'garbage',
          NODE_ENV: 'production',
        }).resolveStrictHostKeyChecking(),
      ).toBe('yes');
    });
  });

  describe('isStrictMode', () => {
    it('is true only when checking is yes', () => {
      expect(
        build({ ANSIBLE_STRICT_HOST_KEY_CHECKING: 'yes' }).isStrictMode(),
      ).toBe(true);
      expect(
        build({
          ANSIBLE_STRICT_HOST_KEY_CHECKING: 'accept-new',
        }).isStrictMode(),
      ).toBe(false);
    });
  });

  describe('resolveKnownHostsPath', () => {
    it('sanitizes + resolves a configured path', () => {
      const p = build({
        ANSIBLE_KNOWN_HOSTS_PATH: '/etc/kh"; rm',
      }).resolveKnownHostsPath();
      expect(p).not.toMatch(/["';]/);
    });
    it('falls back to <cwd>/.local/ssh/known_hosts', () => {
      expect(build().resolveKnownHostsPath()).toBe(
        resolve(process.cwd(), '.local/ssh/known_hosts'),
      );
    });
  });

  describe('resolveSshCommonArgs', () => {
    it('includes strict-host-key-checking and the known-hosts file', () => {
      const args = build({
        ANSIBLE_STRICT_HOST_KEY_CHECKING: 'yes',
      }).resolveSshCommonArgs();
      expect(args).toContain('StrictHostKeyChecking=yes');
      expect(args).toContain('UserKnownHostsFile=');
      expect(args).toContain('IdentitiesOnly=yes');
    });
  });

  describe('hostVerifier', () => {
    it('accepts the pinned key (string or Buffer) and rejects others', () => {
      const raw = Buffer.from('host-key-raw-bytes');
      const expected = raw.toString('base64');
      const verify = build().hostVerifier(expected);
      expect(verify(expected)).toBe(true); // already base64 string
      expect(verify(raw)).toBe(true); // Buffer → base64 round-trip
      expect(verify('SOMETHINGELSE')).toBe(false);
    });
  });
});
