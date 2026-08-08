import { ConfigService } from '@nestjs/config';
import { resolve } from 'path';
import { ServerHostKeyService } from './server-host-key.service';

// Module-level mock du binaire ssh-keyscan (le service le spawn en subprocess).
// On enregistre les callbacks pour déclencher 'close'/'error' après coup.
const spawnMock = jest.fn();
type ProcHandlers = Record<string, (...args: unknown[]) => void>;
const procHandlers: ProcHandlers = {};

jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => {
    spawnMock(...args);
    const proc = {
      stdout: {
        on: (_ev: string, cb: (chunk: Buffer) => void) => {
          procHandlers['stdout'] = cb;
        },
      },
      on: (ev: string, cb: (...a: unknown[]) => void) => {
        procHandlers[ev] = cb;
      },
      kill: jest.fn(),
    } as unknown as ReturnType<typeof import('child_process').spawn>;
    return proc;
  },
}));

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

  describe('resolveForConnection (SSH host key pinning / TOFU)', () => {
    const tmpKnownHosts = () =>
      require('path').join(
        require('os').tmpdir(),
        `kh-${Math.random().toString(36).slice(2)}-${process.pid}`,
      );

    const emitClose = (code = 0, out?: string) => {
      const cb = procHandlers['stdout'] as
        | ((chunk: Buffer) => void)
        | undefined;
      if (out !== undefined && cb) cb(Buffer.from(out));
      procHandlers['close']?.(code);
    };

    beforeEach(() => {
      spawnMock.mockClear();
      for (const k of Object.keys(procHandlers)) delete procHandlers[k];
    });

    it('pins on first use (TOFU) then returns the same pinned key', async () => {
      const file = tmpKnownHosts();
      const svc = build({ ANSIBLE_KNOWN_HOSTS_PATH: file });
      const server = { host: '1.2.3.4', port: 22 };

      // Scan systématique avant lecture du fichier pinned (TOFU à chaque appel).
      const firstPromise = svc.resolveForConnection(server, {
        allowTrustOnFirstUse: true,
      });
      emitClose(0, '[1.2.3.4]:22 ssh-ed25519 KEYONE');
      const first = await firstPromise;
      expect(first.keyBase64).toBe('KEYONE');

      // Deuxième appel : re-scan mais la clé pinée correspond → même résultat.
      const secondPromise = svc.resolveForConnection(server, {
        allowTrustOnFirstUse: false,
      });
      emitClose(0, '[1.2.3.4]:22 ssh-ed25519 KEYONE');
      const second = await secondPromise;
      expect(second.keyBase64).toBe('KEYONE');
    });

    it('rejects when allowTrustOnFirstUse=false and nothing is pinned', async () => {
      const svc = build({ ANSIBLE_KNOWN_HOSTS_PATH: tmpKnownHosts() });
      // scan réussit mais aucune entrée pinée ne correspond → rejet TOFU.
      const pending = svc.resolveForConnection(
        { host: '6.6.6.6', port: 22 },
        { allowTrustOnFirstUse: false },
      );
      emitClose(0, '[6.6.6.6]:22 ssh-ed25519 KEYONE');
      await expect(pending).rejects.toThrow(/pinée|pin|TOFU/i);
    });

    it('throws a MITM/mismatch error when the scanned key differs from the pinned one', async () => {
      const file = tmpKnownHosts();
      const svc = build({ ANSIBLE_KNOWN_HOSTS_PATH: file });
      const server = { host: '9.9.9.9', port: 22 };

      // Pin de la clé A (TOFU).
      const pinPromise = svc.resolveForConnection(server, {
        allowTrustOnFirstUse: true,
      });
      emitClose(0, '[9.9.9.9]:22 ssh-ed25519 KEYA');
      await pinPromise;

      // 2e connexion : le serveur présente une autre clé → overflow mismatch.
      const mismatchPromise = svc.resolveForConnection(server, {
        allowTrustOnFirstUse: false,
      });
      emitClose(0, '[9.9.9.9]:22 ssh-ed25519 EVILKEY');
      await expect(mismatchPromise).rejects.toThrow(/mismatch|MITM/i);
    });

    it('throws when ssh-keyscan returns no valid key', async () => {
      const svc = build({ ANSIBLE_KNOWN_HOSTS_PATH: tmpKnownHosts() });
      const pending = svc.resolveForConnection(
        { host: '3.3.3.3', port: 22 },
        { allowTrustOnFirstUse: true },
      );
      emitClose(0, '# no keys\n');
      await expect(pending).rejects.toThrow(/clé|key/i);
    });
  });
});
