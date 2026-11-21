import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { GitProviderOauthService } from './git-provider-oauth.service';

describe('GitProviderOauthService — helpers', () => {
  let prisma: {
    gitProviderConfig: { findUnique: jest.Mock; findFirst: jest.Mock };
  };
  let service: GitProviderOauthService;

  const priv = <T>(name: string, ...args: unknown[]): T =>
    (service as unknown as Record<string, (...a: unknown[]) => T>)[name](
      ...args,
    );

  beforeEach(() => {
    prisma = {
      gitProviderConfig: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    const config = {
      get: jest.fn(
        (_k: string, def?: string) => def ?? 'http://localhost:3000',
      ),
    };
    service = new GitProviderOauthService(
      prisma as unknown as PrismaService,
      {} as unknown as HttpService,
      {} as unknown as CryptoService,
      config as unknown as ConfigService,
      {},
    );
  });

  it('prefers the isDefault GitLab provider, else the oldest', async () => {
    prisma.gitProviderConfig.findFirst.mockResolvedValueOnce({ id: 'def' });
    const res = await priv<Promise<{ id: string } | null>>(
      'getDefaultGitlabProvider',
    );
    expect(res?.id).toBe('def');
  });

  it('falls back to the oldest provider when none is default', async () => {
    prisma.gitProviderConfig.findFirst
      .mockResolvedValueOnce(null) // no default
      .mockResolvedValueOnce({ id: 'oldest' });
    const res = await priv<Promise<{ id: string } | null>>(
      'getDefaultGitlabProvider',
    );
    expect(res?.id).toBe('oldest');
  });

  it('404s getGitlabProviderOrFail for a missing or wrong-type provider', async () => {
    prisma.gitProviderConfig.findUnique.mockResolvedValue({
      id: 'g1',
      type: GitProviderType.GITHUB,
    });
    await expect(
      priv<Promise<unknown>>('getGitlabProviderOrFail', 'g1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── Public methods ──────────────────────────────────────────────────────────

function makeFullSvc(
  opts: {
    provider?: Partial<{
      id: string;
      type: string;
      isDefault: boolean;
      providerUrl: string;
      applicationId: string;
      applicationSecret: string;
      redirectUri: string;
      oauthState: string;
      oauthStateExpiresAt: Date;
      oauthAccessToken: string | null;
      oauthRefreshToken: string | null;
      oauthExpiresAt: Date | null;
    }> | null;
    tokenResponse?: {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    httpError?: boolean;
    oauthCandidates?: unknown[];
  } = {},
) {
  const defaultProvider =
    opts.provider !== undefined
      ? opts.provider
        ? {
            id: 'prov1',
            type: GitProviderType.GITLAB,
            isDefault: false,
            providerUrl: 'https://gitlab.example.com',
            applicationId: 'app-id',
            applicationSecret: 'enc-secret',
            redirectUri: 'https://platform.io/gitlab/callback',
            oauthState: null,
            oauthStateExpiresAt: null,
            oauthAccessToken: null,
            oauthRefreshToken: null,
            oauthExpiresAt: null,
            ...opts.provider,
          }
        : null
      : {
          id: 'prov1',
          type: GitProviderType.GITLAB,
          isDefault: false,
          providerUrl: 'https://gitlab.example.com',
          applicationId: 'app-id',
          applicationSecret: 'enc-secret',
          redirectUri: 'https://platform.io/gitlab/callback',
          oauthState: null,
          oauthStateExpiresAt: null,
          oauthAccessToken: null,
          oauthRefreshToken: null,
          oauthExpiresAt: null,
        };

  const prismaFull = {
    gitProviderConfig: {
      findUnique: jest.fn().mockResolvedValue(defaultProvider),
      findFirst: jest.fn().mockResolvedValue(defaultProvider),
      findMany: jest.fn().mockResolvedValue(opts.oauthCandidates ?? []),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: unknown }) =>
          Promise.resolve({ ...(defaultProvider ?? {}), ...(data as object) }),
        ),
    },
    platformConfig: {
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const httpFull = {
    post: opts.httpError
      ? jest.fn().mockReturnValue(throwError(() => new Error('network error')))
      : jest.fn().mockReturnValue(
          of({
            data: opts.tokenResponse ?? {
              access_token: 'new-token',
              refresh_token: 'rtoken',
              expires_in: 7200,
            },
          }),
        ),
  };

  const cryptoFull = {
    decrypt: jest.fn().mockImplementation((v: string) => `dec-${v}`),
    encrypt: jest.fn().mockImplementation((v: string) => `enc-${v}`),
  };

  const configFull = {
    get: jest.fn((_k: string, def?: string) => def ?? 'http://localhost:3000'),
  };

  const legacySyncFull = {
    syncDefaultConfig: jest.fn().mockResolvedValue(undefined),
  };

  return {
    svc: new GitProviderOauthService(
      prismaFull as unknown as PrismaService,
      httpFull as unknown as HttpService,
      cryptoFull as unknown as CryptoService,
      configFull as unknown as ConfigService,
      legacySyncFull,
    ),
    prismaFull,
    httpFull,
    cryptoFull,
    legacySyncFull,
  };
}

describe('GitProviderOauthService — startGitlabOAuth', () => {
  it('throws BadRequestException when no default provider exists', async () => {
    const { svc } = makeFullSvc({ provider: null });
    await expect(svc.startGitlabOAuth('https://platform.io')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when applicationId is missing', async () => {
    const { svc } = makeFullSvc({ provider: { applicationId: '' } });
    await expect(svc.startGitlabOAuth('https://platform.io')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('GitProviderOauthService — startGitlabOAuthForProvider', () => {
  it('generates state and returns authorizeUrl with correct params', async () => {
    const { svc, prismaFull } = makeFullSvc();
    const result = await svc.startGitlabOAuthForProvider(
      'prov1',
      'https://platform.io',
    );
    expect(result.authorizeUrl).toContain('/oauth/authorize');
    expect(result.authorizeUrl).toContain('client_id=app-id');
    expect(result.authorizeUrl).toContain('response_type=code');
    expect(prismaFull.gitProviderConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ oauthState: expect.any(String) }),
      }),
    );
  });

  it('throws NotFoundException for wrong provider type', async () => {
    const { svc } = makeFullSvc({
      provider: { type: GitProviderType.GITHUB },
    });
    await expect(
      svc.startGitlabOAuthForProvider('prov1', 'https://platform.io'),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('GitProviderOauthService — completeGitlabOAuthCallback', () => {
  it('returns ok=false when input.error is present', async () => {
    const { svc } = makeFullSvc();
    const result = await svc.completeGitlabOAuthCallback({
      error: 'access_denied',
      errorDescription: 'User denied',
      callbackBaseUrl: 'https://platform.io',
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('User denied');
  });

  it('returns ok=false when code or state is missing', async () => {
    const { svc } = makeFullSvc();
    const result = await svc.completeGitlabOAuthCallback({
      callbackBaseUrl: 'https://p.io',
    });
    expect(result.ok).toBe(false);
  });

  it('returns ok=false when state is invalid (no candidates)', async () => {
    const { svc } = makeFullSvc({ oauthCandidates: [] });
    const result = await svc.completeGitlabOAuthCallback({
      code: 'abc',
      state: 'bad-state',
      callbackBaseUrl: 'https://platform.io',
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('expiré');
  });

  it('returns ok=true and saves token when state matches', async () => {
    const state = 'a'.repeat(64);
    const future = new Date(Date.now() + 600_000);
    const { svc, prismaFull } = makeFullSvc({
      oauthCandidates: [
        {
          id: 'prov1',
          type: GitProviderType.GITLAB,
          providerUrl: 'https://gitlab.example.com',
          applicationId: 'app-id',
          applicationSecret: 'enc-secret',
          redirectUri: 'https://platform.io/gitlab/callback',
          isDefault: false,
          oauthState: state,
          oauthStateExpiresAt: future,
          oauthAccessToken: null,
          oauthRefreshToken: null,
          oauthExpiresAt: null,
        },
      ],
    });
    const result = await svc.completeGitlabOAuthCallback({
      code: 'auth-code',
      state,
      callbackBaseUrl: 'https://platform.io',
    });
    expect(result.ok).toBe(true);
    expect(prismaFull.gitProviderConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          oauthAccessToken: expect.stringContaining('enc-'),
        }),
      }),
    );
  });

  it('returns ok=false when HTTP token exchange fails', async () => {
    const state = 'b'.repeat(64);
    const future = new Date(Date.now() + 600_000);
    const { svc } = makeFullSvc({
      httpError: true,
      oauthCandidates: [
        {
          id: 'prov1',
          type: GitProviderType.GITLAB,
          providerUrl: 'https://gitlab.example.com',
          applicationId: 'app-id',
          applicationSecret: 'enc-secret',
          redirectUri: 'https://platform.io/gitlab/callback',
          isDefault: false,
          oauthState: state,
          oauthStateExpiresAt: future,
          oauthAccessToken: null,
          oauthRefreshToken: null,
          oauthExpiresAt: null,
        },
      ],
    });
    const result = await svc.completeGitlabOAuthCallback({
      code: 'auth-code',
      state,
      callbackBaseUrl: 'https://platform.io',
    });
    expect(result.ok).toBe(false);
  });
});

describe('GitProviderOauthService — refreshProviderOAuthTokenIfNeeded', () => {
  const baseProvider = {
    id: 'prov1',
    type: GitProviderType.GITLAB,
    isDefault: false,
    providerUrl: 'https://gitlab.example.com',
    applicationId: 'app-id',
    applicationSecret: 'enc-secret',
    redirectUri: null,
    oauthState: null,
    oauthStateExpiresAt: null,
    groupNames: null,
    adminToken: null,
    internalUrl: null,
    name: 'GitLab',
    oauthAccessToken: null,
    oauthRefreshToken: null,
    oauthExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never;

  it('returns provider as-is when no oauthAccessToken', async () => {
    const { svc } = makeFullSvc();
    const result = await svc.refreshProviderOAuthTokenIfNeeded({
      ...baseProvider,
      oauthAccessToken: null,
      oauthExpiresAt: null,
    });
    expect(result).toBe(result);
  });

  it('returns provider as-is when no expiry set', async () => {
    const { svc } = makeFullSvc();
    const result = await svc.refreshProviderOAuthTokenIfNeeded({
      ...baseProvider,
      oauthAccessToken: 'enc-tok',
      oauthExpiresAt: null,
    });
    expect(result.oauthAccessToken).toBe('enc-tok');
  });

  it('returns provider as-is when token is still fresh', async () => {
    const { svc } = makeFullSvc();
    const future = new Date(Date.now() + 3_600_000);
    const result = await svc.refreshProviderOAuthTokenIfNeeded({
      ...baseProvider,
      oauthAccessToken: 'enc-tok',
      oauthExpiresAt: future,
      oauthRefreshToken: 'enc-rtoken',
    });
    expect(result.oauthAccessToken).toBe('enc-tok');
  });

  it('refreshes token when near expiry', async () => {
    const { svc, prismaFull } = makeFullSvc({
      tokenResponse: { access_token: 'refreshed', expires_in: 7200 },
    });
    const past = new Date(Date.now() - 1000);
    await svc.refreshProviderOAuthTokenIfNeeded({
      ...baseProvider,
      oauthAccessToken: 'enc-old',
      oauthRefreshToken: 'enc-rtoken',
      oauthExpiresAt: past,
    });
    expect(prismaFull.gitProviderConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          oauthAccessToken: expect.stringContaining('enc-'),
        }),
      }),
    );
  });

  it('returns original provider when refresh HTTP call fails', async () => {
    const { svc } = makeFullSvc({ httpError: true });
    const past = new Date(Date.now() - 1000);
    const original = {
      ...baseProvider,
      oauthAccessToken: 'enc-old',
      oauthRefreshToken: 'enc-rtoken',
      oauthExpiresAt: past,
    };
    const result = await svc.refreshProviderOAuthTokenIfNeeded(original);
    expect(result).toBe(original);
  });
});
