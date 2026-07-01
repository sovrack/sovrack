import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { GitlabConnectionTesterService } from './gitlab-connection-tester.service';

function makeProvider(overrides: Partial<{
  providerUrl: string;
  oauthAccessToken: string | null;
  adminToken: string | null;
}> = {}) {
  return {
    id: 'prov1',
    providerUrl: 'https://gitlab.com',
    oauthAccessToken: null,
    adminToken: 'enc-admin-token',
    ...overrides,
  } as never;
}

function makeSvc(opts: {
  httpOk?: boolean;
  httpError?: Error;
  decryptResult?: string;
  legacyConfigs?: Record<string, { value: string; isSecret: boolean } | null>;
} = {}) {
  const http = {
    get: opts.httpError
      ? jest.fn().mockReturnValue(throwError(() => opts.httpError))
      : jest.fn().mockReturnValue(of({ data: { id: 1, username: 'admin' } })),
  } as never;

  const crypto = {
    decrypt: jest.fn().mockReturnValue(opts.decryptResult ?? 'decrypted-token'),
  } as never;

  const oauth = {
    refreshProviderOAuthTokenIfNeeded: jest.fn().mockImplementation((p: unknown) =>
      Promise.resolve(p),
    ),
  } as never;

  const legacyConfigs = opts.legacyConfigs ?? {
    GITLAB_URL: { value: 'https://gitlab.com', isSecret: false },
    GITLAB_TOKEN: { value: 'admin-token', isSecret: false },
    GITLAB_OAUTH_ACCESS_TOKEN: null,
  };

  const prisma = {
    platformConfig: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { key: string } }) =>
        Promise.resolve(legacyConfigs[where.key] ?? null),
      ),
    },
  } as never;

  return {
    svc: new GitlabConnectionTesterService(prisma, http, crypto, oauth),
    http, crypto, oauth,
  };
}

describe('GitlabConnectionTesterService', () => {
  describe('testProvider', () => {
    it('throws BadRequestException when both tokens are empty', async () => {
      const { svc } = makeSvc({ decryptResult: '' });
      const provider = makeProvider({ oauthAccessToken: null, adminToken: null });
      await expect(svc.testProvider(provider)).rejects.toThrow(BadRequestException);
    });

    it('returns ok=true for valid admin token', async () => {
      const { svc } = makeSvc();
      const provider = makeProvider({ oauthAccessToken: null, adminToken: 'enc-tok' });
      const result = await svc.testProvider(provider);
      expect(result.ok).toBe(true);
      expect(result.message).toContain('Admin Token');
    });

    it('returns ok=true with oauth token when oauth is valid', async () => {
      const { svc } = makeSvc();
      const provider = makeProvider({ oauthAccessToken: 'enc-oauth', adminToken: null });
      const result = await svc.testProvider(provider);
      expect(result.ok).toBe(true);
      expect(result.message).toContain('OAuth');
    });

    it('falls back to admin token when oauth request fails', async () => {
      const httpGet = jest.fn()
        .mockReturnValueOnce(throwError(() => new Error('oauth failed')))
        .mockReturnValueOnce(of({ data: { id: 1 } }));
      const svc = new GitlabConnectionTesterService(
        { platformConfig: { findUnique: jest.fn() } } as never,
        { get: httpGet } as never,
        { decrypt: jest.fn().mockReturnValue('tok') } as never,
        { refreshProviderOAuthTokenIfNeeded: jest.fn().mockImplementation((p: unknown) => Promise.resolve(p)) } as never,
      );
      const provider = makeProvider({ oauthAccessToken: 'enc-oauth', adminToken: 'enc-admin' });
      const result = await svc.testProvider(provider);
      expect(result.ok).toBe(true);
      expect(result.message).toContain('fallback Admin Token');
    });

    it('throws BadRequestException when provider URL is empty', async () => {
      const { svc } = makeSvc();
      const provider = makeProvider({ providerUrl: '' });
      await expect(svc.testProvider(provider)).rejects.toThrow(BadRequestException);
    });

    it('sends PRIVATE-TOKEN header for admin token requests', async () => {
      const { svc, http } = makeSvc();
      const provider = makeProvider({ oauthAccessToken: null, adminToken: 'enc-tok' });
      await svc.testProvider(provider);
      const opts = (http.get as jest.Mock).mock.calls[0][1] as { headers: Record<string, string> };
      expect(opts.headers['PRIVATE-TOKEN']).toBe('decrypted-token');
    });
  });

  describe('testLegacyConfig', () => {
    it('throws BadRequestException when GITLAB_URL is not configured', async () => {
      const { svc } = makeSvc({
        legacyConfigs: {
          GITLAB_URL: null,
          GITLAB_TOKEN: { value: 'tok', isSecret: false },
          GITLAB_OAUTH_ACCESS_TOKEN: null,
        },
      });
      await expect(svc.testLegacyConfig()).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when no tokens are configured', async () => {
      const { svc } = makeSvc({
        legacyConfigs: {
          GITLAB_URL: { value: 'https://gitlab.com', isSecret: false },
          GITLAB_TOKEN: null,
          GITLAB_OAUTH_ACCESS_TOKEN: null,
        },
      });
      await expect(svc.testLegacyConfig()).rejects.toThrow(BadRequestException);
    });

    it('returns ok=true when admin token is valid', async () => {
      const { svc } = makeSvc();
      const result = await svc.testLegacyConfig();
      expect(result.ok).toBe(true);
      expect(result.message).toContain('Admin Token');
    });

    it('decrypts secret config values', async () => {
      const { svc, crypto } = makeSvc({
        legacyConfigs: {
          GITLAB_URL: { value: 'https://gitlab.com', isSecret: false },
          GITLAB_TOKEN: { value: 'enc-tok', isSecret: true },
          GITLAB_OAUTH_ACCESS_TOKEN: null,
        },
      });
      await svc.testLegacyConfig();
      expect(crypto.decrypt).toHaveBeenCalledWith('enc-tok');
    });
  });
});
