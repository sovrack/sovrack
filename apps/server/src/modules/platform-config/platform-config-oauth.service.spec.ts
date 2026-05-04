/**
 * Unit tests for the GitLab OAuth callback flow in PlatformConfigService.
 *
 * These tests cover the two bugs fixed in completeGitlabOAuthCallback:
 * 1. catch{} was swallowing errors silently → now logs + returns meaningful message
 * 2. syncLegacyDefaultGitlabConfig failure was masking a successful token save
 */

import { HttpModule, HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformConfigService } from './platform-config.service';

const CONFIG_SECRET = 'test-config-secret-exactly-32-chars!!';

const MOCK_PROVIDER = {
  id: 'provider-1',
  name: 'Test GitLab',
  type: 'GITLAB',
  gitlabUrl: 'https://gitlab.com',
  internalUrl: null,
  redirectUri: 'https://api.example.com/providers/gitlab/callback',
  applicationId: 'app-id-123',
  applicationSecret: null, // will be set in each test
  groupNames: null,
  adminToken: null,
  oauthAccessToken: null,
  oauthRefreshToken: null,
  oauthExpiresAt: null,
  oauthState: 'valid-state-abc123',
  oauthStateExpiresAt: new Date(Date.now() + 300_000),
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePrismaMock() {
  return {
    gitProviderConfig: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue(MOCK_PROVIDER),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
    },
    platformConfig: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('PlatformConfigService — OAuth callback', () => {
  let service: PlatformConfigService;
  let httpService: HttpService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    process.env.CONFIG_SECRET = CONFIG_SECRET;
    process.env.FRONTEND_URL = 'http://localhost:3000';

    prisma = makePrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [
        PlatformConfigService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(PlatformConfigService);
    httpService = module.get(HttpService);
  });

  afterEach(() => {
    delete process.env.CONFIG_SECRET;
    delete process.env.FRONTEND_URL;
    jest.restoreAllMocks();
  });

  describe('completeGitlabOAuthCallback', () => {
    it('returns ok:false with error detail when GitLab rejects the code', async () => {
      // Provider found by state
      prisma.gitProviderConfig.findMany.mockResolvedValue([
        {
          ...MOCK_PROVIDER,
          applicationSecret: service['encrypt']('app-secret-valid'),
        },
      ]);

      // GitLab returns 400 with error_description
      const axiosError = Object.assign(new Error('Request failed'), {
        response: {
          status: 400,
          data: {
            error: 'invalid_grant',
            error_description: 'The provided authorization grant is invalid',
          },
        },
      });

      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(throwError(() => axiosError));

      const result = await service.completeGitlabOAuthCallback({
        code: 'bad-code',
        state: 'valid-state-abc123',
        callbackBaseUrl: 'https://api.example.com',
      });

      expect(result.ok).toBe(false);
      // Should surface the GitLab error_description, not a generic message
      expect(result.message).toContain('invalid');
      // Token must NOT have been saved
      const calls = prisma.gitProviderConfig.update.mock.calls as Array<
        [{ data: { oauthAccessToken?: unknown } }]
      >;
      const updateCall = calls.find((c) =>
        Boolean(c[0]?.data?.oauthAccessToken),
      );
      expect(updateCall).toBeUndefined();
    });

    it('returns ok:true and saves encrypted token on successful exchange', async () => {
      prisma.gitProviderConfig.findMany.mockResolvedValue([
        {
          ...MOCK_PROVIDER,
          applicationSecret: service['encrypt']('app-secret-valid'),
        },
      ]);

      // GitLab returns a valid token response
      jest.spyOn(httpService, 'post').mockReturnValue(
        of({
          data: {
            access_token: 'gloas-test-access-token-abc',
            refresh_token: 'gloas-test-refresh-token-xyz',
            expires_in: 7200,
          },
        } as never),
      );

      // Mock syncLegacyDefaultGitlabConfig path
      prisma.gitProviderConfig.findFirst.mockResolvedValue({
        ...MOCK_PROVIDER,
        oauthAccessToken: service['encrypt']('gloas-test-access-token-abc'),
      });

      const result = await service.completeGitlabOAuthCallback({
        code: 'good-code',
        state: 'valid-state-abc123',
        callbackBaseUrl: 'https://api.example.com',
      });

      expect(result.ok).toBe(true);
      // Token must have been stored
      const saveCalls = prisma.gitProviderConfig.update.mock.calls as Array<
        [{ data: { oauthAccessToken?: unknown } }]
      >;
      const saveCall = saveCalls.find((c) =>
        Boolean(c[0]?.data?.oauthAccessToken),
      );
      expect(saveCall).toBeDefined();
      // Token in DB must be encrypted (not plaintext)
      const savedToken = saveCall?.[0]?.data?.oauthAccessToken as string;
      expect(savedToken).not.toBe('gloas-test-access-token-abc');
      expect(service['decrypt'](savedToken)).toBe(
        'gloas-test-access-token-abc',
      );
    });

    it('returns ok:true even when syncLegacyDefaultGitlabConfig fails', async () => {
      prisma.gitProviderConfig.findMany.mockResolvedValue([
        {
          ...MOCK_PROVIDER,
          applicationSecret: service['encrypt']('app-secret-valid'),
        },
      ]);

      jest.spyOn(httpService, 'post').mockReturnValue(
        of({
          data: {
            access_token: 'gloas-abc',
            refresh_token: null,
            expires_in: 3600,
          },
        } as never),
      );

      // syncLegacyDefaultGitlabConfig will call findFirst/upsert which we make throw
      prisma.gitProviderConfig.findFirst.mockRejectedValue(
        new Error('DB connection lost'),
      );

      const result = await service.completeGitlabOAuthCallback({
        code: 'good-code',
        state: 'valid-state-abc123',
        callbackBaseUrl: 'https://api.example.com',
      });

      // OAuth must still succeed — token was saved before syncLegacy was called
      expect(result.ok).toBe(true);
    });

    it('returns ok:false with state-expired message when state not found', async () => {
      prisma.gitProviderConfig.findMany.mockResolvedValue([]);

      const result = await service.completeGitlabOAuthCallback({
        code: 'any-code',
        state: 'nonexistent-state',
        callbackBaseUrl: 'https://api.example.com',
      });

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/state|expiré|invalid/i);
    });

    it('handles missing code/state gracefully', async () => {
      const result = await service.completeGitlabOAuthCallback({
        code: undefined,
        state: undefined,
        callbackBaseUrl: 'https://api.example.com',
      });

      expect(result.ok).toBe(false);
    });
  });
});
