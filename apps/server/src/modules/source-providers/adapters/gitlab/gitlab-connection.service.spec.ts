import { BadRequestException } from '@nestjs/common';
import { SourceType } from '@prisma/client';
import { GitProviderConfigService } from '../../shared/connection/git-provider-config.service';
import { GitlabConnectionService } from './gitlab-connection.service';
import type { GitlabResolvedConfig } from './gitlab.types';

function makeSvc(
  registryOverrides: Partial<{
    listGitlabProvidersForProjects: jest.Mock;
    resolveGitlabCredentials: jest.Mock;
  }> = {},
) {
  const registry = {
    listGitlabProvidersForProjects: jest.fn().mockResolvedValue([]),
    resolveGitlabCredentials: jest.fn().mockResolvedValue({
      providerUrl: 'https://gitlab.com',
      token: 'default-token',
      providerId: 'prov-default',
    }),
    ...registryOverrides,
  } as unknown as GitProviderConfigService;
  return { svc: new GitlabConnectionService(registry), registry };
}

describe('GitlabConnectionService', () => {
  describe('normalizeUrl', () => {
    it('trims whitespace', () => {
      const { svc } = makeSvc();
      expect(svc.normalizeUrl('  https://gitlab.com  ')).toBe(
        'https://gitlab.com',
      );
    });

    it('strips trailing slashes', () => {
      const { svc } = makeSvc();
      expect(svc.normalizeUrl('https://gitlab.com///')).toBe(
        'https://gitlab.com',
      );
    });
  });

  describe('normalizeOptionalString', () => {
    it('returns null for non-string values', () => {
      const { svc } = makeSvc();
      expect(svc.normalizeOptionalString(undefined)).toBeNull();
      expect(svc.normalizeOptionalString(null)).toBeNull();
    });

    it('returns null for empty or whitespace strings', () => {
      const { svc } = makeSvc();
      expect(svc.normalizeOptionalString('')).toBeNull();
      expect(svc.normalizeOptionalString('   ')).toBeNull();
    });

    it('returns trimmed non-empty string', () => {
      const { svc } = makeSvc();
      expect(svc.normalizeOptionalString('  hello  ')).toBe('hello');
    });
  });

  describe('normalizeGitlabIdentifier', () => {
    it('converts a positive integer to string', () => {
      const { svc } = makeSvc();
      expect(svc.normalizeGitlabIdentifier(42, 'Project ID')).toBe('42');
    });

    it('throws BadRequestException for non-positive integer', () => {
      const { svc } = makeSvc();
      expect(() => svc.normalizeGitlabIdentifier(0, 'ID')).toThrow(
        BadRequestException,
      );
      expect(() => svc.normalizeGitlabIdentifier(-1, 'ID')).toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for non-integer number', () => {
      const { svc } = makeSvc();
      expect(() => svc.normalizeGitlabIdentifier(1.5, 'ID')).toThrow(
        BadRequestException,
      );
    });

    it('accepts a non-empty string', () => {
      const { svc } = makeSvc();
      expect(svc.normalizeGitlabIdentifier('group/project', 'Path')).toBe(
        'group/project',
      );
    });

    it('throws BadRequestException for empty string', () => {
      const { svc } = makeSvc();
      expect(() => svc.normalizeGitlabIdentifier('  ', 'Path')).toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for null/undefined', () => {
      const { svc } = makeSvc();
      expect(() => svc.normalizeGitlabIdentifier(undefined, 'Path')).toThrow(
        BadRequestException,
      );
      expect(() => svc.normalizeGitlabIdentifier(null, 'Path')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('resolveNumericGitlabId', () => {
    it('returns apiId when it is a positive integer', () => {
      const { svc } = makeSvc();
      expect(svc.resolveNumericGitlabId(123, 'group/project', 'Project')).toBe(
        123,
      );
    });

    it('parses the identifier string when apiId is undefined', () => {
      const { svc } = makeSvc();
      expect(svc.resolveNumericGitlabId(undefined, '456', 'Project')).toBe(456);
    });

    it('throws BadRequestException when neither is resolvable', () => {
      const { svc } = makeSvc();
      expect(() =>
        svc.resolveNumericGitlabId(undefined, 'not-a-number', 'Project'),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for zero apiId and non-numeric identifier', () => {
      const { svc } = makeSvc();
      expect(() => svc.resolveNumericGitlabId(0, 'abc', 'ID')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('normalizeRepositoryPath', () => {
    it('strips .git suffix', () => {
      const { svc } = makeSvc();
      expect(svc.normalizeRepositoryPath('group/repo.git')).toBe('group/repo');
    });

    it('extracts path from a full HTTPS URL', () => {
      const { svc } = makeSvc();
      expect(
        svc.normalizeRepositoryPath('https://gitlab.com/group/repo.git'),
      ).toBe('group/repo');
    });

    it('handles SSH URL (git@host:path)', () => {
      const { svc } = makeSvc();
      const result = svc.normalizeRepositoryPath(
        'git@gitlab.com:group/repo.git',
      );
      expect(result).toContain('group/repo');
    });

    it('strips leading and trailing slashes', () => {
      const { svc } = makeSvc();
      expect(svc.normalizeRepositoryPath('/group/repo/')).toBe('group/repo');
    });
  });

  describe('toPublicConfig', () => {
    const config: GitlabResolvedConfig = {
      id: 'cfg1',
      providerUrl: 'https://gitlab.example.com',
      providerToken: 'secret-token',
      externalId: 42,
      externalGroupId: 7,
      defaultBranch: 'main',
      sourceType: SourceType.GIT_PROVIDER,
      providerId: 'prov1',
      deployTokenUsername: 'deploy-user',
      registryUrl: 'registry.example.com',
      deployTokenValue: 'enc-deploy-token',
      webhookSecret: 'enc-webhook-secret',
      projectId: 'proj1',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-06-01'),
    };

    it('masks gitlabToken as ***', () => {
      const { svc } = makeSvc();
      const pub = svc.toPublicConfig(config);
      expect(pub.gitlabToken).toBe('***');
    });

    it('masks deployTokenValue as *** when present', () => {
      const { svc } = makeSvc();
      const pub = svc.toPublicConfig(config);
      expect(pub.deployTokenValue).toBe('***');
    });

    it('returns empty string for deployTokenValue when absent', () => {
      const { svc } = makeSvc();
      const pub = svc.toPublicConfig({ ...config, deployTokenValue: null });
      expect(pub.deployTokenValue).toBe('');
    });

    it('reports webhookSecretConfigured=true when secret is set', () => {
      const { svc } = makeSvc();
      const pub = svc.toPublicConfig(config);
      expect(pub.webhookSecretConfigured).toBe(true);
    });

    it('reports webhookSecretConfigured=false when secret is null', () => {
      const { svc } = makeSvc();
      const pub = svc.toPublicConfig({ ...config, webhookSecret: null });
      expect(pub.webhookSecretConfigured).toBe(false);
    });

    it('maps externalId/externalGroupId to numbers', () => {
      const { svc } = makeSvc();
      const pub = svc.toPublicConfig(config);
      expect(pub.gitlabId).toBe(42);
      expect(pub.gitlabGroupId).toBe(7);
    });
  });

  describe('resolveGitlabConnectionInput', () => {
    it('returns manual url+token when both provided without providerId', async () => {
      const { svc } = makeSvc();
      const result = await svc.resolveGitlabConnectionInput({
        gitlabUrl: 'https://git.corp.io',
        gitlabToken: 'my-token',
      } as never);
      expect(result.gitlabUrl).toBe('https://git.corp.io');
      expect(result.gitlabToken).toBe('my-token');
      expect(result.providerId).toBeNull();
    });

    it('throws BadRequestException when only one of url/token is provided', async () => {
      const { svc } = makeSvc();
      await expect(
        svc.resolveGitlabConnectionInput({
          gitlabUrl: 'https://git.io',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses default provider credentials when nothing is provided', async () => {
      const { svc } = makeSvc();
      const result = await svc.resolveGitlabConnectionInput({} as never);
      expect(result.providerId).toBe('prov-default');
      expect(result.gitlabToken).toBe('default-token');
    });

    it('resolves provider credentials by providerId', async () => {
      const { svc, registry } = makeSvc({
        resolveGitlabCredentials: jest.fn().mockResolvedValue({
          providerUrl: 'https://git.corp.io',
          token: 'corp-token',
          providerId: 'prov-corp',
        }),
      });
      const result = await svc.resolveGitlabConnectionInput({
        providerId: 'prov-corp',
      } as never);
      expect(result.gitlabToken).toBe('corp-token');
      expect(registry.resolveGitlabCredentials).toHaveBeenCalledWith(
        'prov-corp',
      );
    });

    it('uses manual token and provider URL when providerId + manualToken provided', async () => {
      const { svc, registry } = makeSvc({
        listGitlabProvidersForProjects: jest
          .fn()
          .mockResolvedValue([
            { id: 'prov-1', providerUrl: 'https://git.corp.io' },
          ]),
      });
      const result = await svc.resolveGitlabConnectionInput({
        providerId: 'prov-1',
        gitlabToken: 'override-token',
      } as never);
      expect(result.gitlabToken).toBe('override-token');
      expect(result.gitlabUrl).toBe('https://git.corp.io');
    });
  });
});
