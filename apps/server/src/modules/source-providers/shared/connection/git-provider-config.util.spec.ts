import type { GitProviderConfig } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import {
  buildGithubApiBase,
  inferGitlabRegistryUrl,
  normalizeGitlabBaseUrl,
  normalizeOptional,
  requireNonEmpty,
  toGiteaProviderPublic,
  toGithubProviderPublic,
  toGitlabProviderPublic,
} from './git-provider-config.util';

const provider = (over: Partial<GitProviderConfig> = {}): GitProviderConfig =>
  ({
    id: 'p1',
    name: 'Acme',
    type: 'GITLAB',
    providerUrl: 'https://gitlab.example.com',
    internalUrl: null,
    redirectUri: null,
    applicationId: null,
    applicationSecret: null,
    groupNames: null,
    adminToken: null,
    oauthAccessToken: null,
    oauthRefreshToken: null,
    oauthExpiresAt: null,
    oauthState: null,
    oauthStateExpiresAt: null,
    isDefault: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...over,
  }) as GitProviderConfig;

describe('git-provider-config.util', () => {
  describe('normalizeGitlabBaseUrl', () => {
    it('strips trailing slashes', () => {
      expect(normalizeGitlabBaseUrl('https://x.com///')).toBe('https://x.com');
      expect(normalizeGitlabBaseUrl('https://x.com')).toBe('https://x.com');
    });
  });

  describe('inferGitlabRegistryUrl', () => {
    it('maps gitlab.com (any scheme) to registry.gitlab.com', () => {
      expect(inferGitlabRegistryUrl('https://gitlab.com')).toBe(
        'https://registry.gitlab.com',
      );
      expect(inferGitlabRegistryUrl('gitlab.com')).toBe(
        'https://registry.gitlab.com',
      );
    });
    it('prefixes hostname with registry. for self-hosted', () => {
      expect(inferGitlabRegistryUrl('https://gitlab.acme.io/')).toBe(
        'https://registry.gitlab.acme.io',
      );
    });
    it('falls back to registry.<raw> on unparseable input', () => {
      expect(inferGitlabRegistryUrl('not a url')).toBe(
        'https://registry.not a url',
      );
    });
  });

  describe('buildGithubApiBase', () => {
    it('uses api.github.com for github.com', () => {
      expect(buildGithubApiBase('https://github.com')).toBe(
        'https://api.github.com',
      );
    });
    it('uses /api/v3 for GitHub Enterprise', () => {
      expect(buildGithubApiBase('https://ghe.acme.io/')).toBe(
        'https://ghe.acme.io/api/v3',
      );
    });
  });

  describe('normalizeOptional', () => {
    it('trims, and empties → null', () => {
      expect(normalizeOptional('  hi  ')).toBe('hi');
      expect(normalizeOptional('   ')).toBeNull();
      expect(normalizeOptional(null)).toBeNull();
      expect(normalizeOptional(undefined)).toBeNull();
    });
  });

  describe('requireNonEmpty', () => {
    it('returns trimmed value', () => {
      expect(requireNonEmpty('  ok ', 'msg')).toBe('ok');
    });
    it('throws BadRequest on empty', () => {
      expect(() => requireNonEmpty('   ', 'boom')).toThrow(BadRequestException);
    });
  });

  describe('toGitlabProviderPublic status machine', () => {
    it('NOT_CONFIGURED when fully empty', () => {
      expect(toGitlabProviderPublic(provider({ providerUrl: '' })).status).toBe(
        'NOT_CONFIGURED',
      );
    });
    it('ACTION_REQUIRED when OAuth app incomplete', () => {
      // URL present but appId/appSecret missing
      expect(toGitlabProviderPublic(provider()).status).toBe('ACTION_REQUIRED');
    });
    it('ACTION_REQUIRED when app complete but no token', () => {
      expect(
        toGitlabProviderPublic(
          provider({ applicationId: 'a', applicationSecret: 's' }),
        ).status,
      ).toBe('ACTION_REQUIRED');
    });
    it('CONFIGURED when app complete + a token', () => {
      expect(
        toGitlabProviderPublic(
          provider({
            applicationId: 'a',
            applicationSecret: 's',
            adminToken: 't',
          }),
        ).status,
      ).toBe('CONFIGURED');
    });
    it('maps type + serializes dates', () => {
      const out = toGitlabProviderPublic(provider());
      expect(out.type).toBe('GITLAB');
      expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(out.adminTokenConfigured).toBe(false);
    });
  });

  describe('toGithubProviderPublic status machine', () => {
    it('CONFIGURED with a PAT', () => {
      expect(
        toGithubProviderPublic(provider({ adminToken: 'pat' })).status,
      ).toBe('CONFIGURED');
    });
    it('CONFIGURED with a non-expired OAuth token', () => {
      expect(
        toGithubProviderPublic(
          provider({
            oauthAccessToken: 'o',
            oauthExpiresAt: new Date(Date.now() + 3_600_000),
          }),
        ).status,
      ).toBe('CONFIGURED');
    });
    it('ACTION_REQUIRED with an expired OAuth token and no PAT', () => {
      expect(
        toGithubProviderPublic(
          provider({
            oauthAccessToken: 'o',
            oauthExpiresAt: new Date(Date.now() - 3_600_000),
          }),
        ).status,
      ).toBe('ACTION_REQUIRED');
    });
    it('NOT_CONFIGURED with nothing', () => {
      expect(toGithubProviderPublic(provider()).status).toBe('NOT_CONFIGURED');
      expect(toGithubProviderPublic(provider()).type).toBe('GITHUB');
    });
  });

  describe('toGiteaProviderPublic', () => {
    it('reuses GitHub shape but tags type GITEA', () => {
      const out = toGiteaProviderPublic(provider({ adminToken: 'pat' }));
      expect(out.type).toBe('GITEA');
      expect(out.status).toBe('CONFIGURED');
    });
  });
});
