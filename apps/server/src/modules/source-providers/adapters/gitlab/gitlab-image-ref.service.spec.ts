import { NotFoundException } from '@nestjs/common';
import { SourceType } from '@prisma/client';
import { GitlabImageRefService } from './gitlab-image-ref.service';

// Extracted from GitlabAdapter — see EXPLORATION_BACKEND_DEPENDANCES.md
// section 4. loadResolvedConfig/resolveRepositoryPathFromConfig/
// resolveDockerImageRef behaviour ported unchanged.
function harness(
  opts: {
    projectFound?: boolean;
    gitProviderConfigFound?: boolean;
  } = {},
) {
  const prisma = {
    project: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.projectFound !== false ? { name: 'my-proj' } : null,
        ),
    },
    service: {
      findFirst: jest.fn().mockResolvedValue(
        opts.projectFound !== false
          ? {
              providerId: 'prov1',
              sourceType: SourceType.GIT,
              branch: 'main',
              repoPath: 'org/app',
              name: 'app',
            }
          : null,
      ),
      findUnique: jest.fn().mockResolvedValue({ name: 'app' }),
    },
    gitProviderConfig: {
      findUnique: jest.fn().mockResolvedValue(
        opts.gitProviderConfigFound !== false
          ? {
              id: 'prov1',
              providerUrl: 'https://gitlab.example.com',
              adminToken: 'enc-tok',
              oauthAccessToken: null,
            }
          : null,
      ),
    },
  };

  const credential = {
    resolveRegistryHost: jest.fn().mockReturnValue('registry.gl.io'),
    isPlaceholderPath: jest.fn().mockReturnValue(false),
    extractPathFromUrl: jest.fn().mockReturnValue(null),
  };

  const apiService = {
    resolveRepositoryPath: jest.fn().mockResolvedValue('org/app'),
  };

  const connection = {
    normalizeRepositoryPath: jest.fn().mockImplementation((p: string) => p),
    normalizeUrl: jest.fn().mockImplementation((u: string) => u),
  };

  const projectConfig = {
    resolveRepoIdForAction: jest.fn().mockResolvedValue(123),
  };

  const service = new GitlabImageRefService(
    prisma as never,
    credential as never,
    apiService as never,
    connection as never,
    projectConfig as never,
  );

  return { service, prisma, credential, apiService, connection, projectConfig };
}

describe('GitlabImageRefService.loadResolvedConfig', () => {
  it('throws NotFoundException when no service with a provider exists', async () => {
    const { service } = harness({ projectFound: false });
    await expect(service.loadResolvedConfig('p1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when the GitProviderConfig row is missing', async () => {
    const { service } = harness({ gitProviderConfigFound: false });
    await expect(service.loadResolvedConfig('p1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('resolves a config using adminToken as providerToken', async () => {
    const { service } = harness();
    const { config } = await service.loadResolvedConfig('p1');
    expect(config.providerToken).toBe('enc-tok');
    expect(config.providerId).toBe('prov1');
  });
});

describe('GitlabImageRefService.resolveDockerImageRef', () => {
  it('falls back to slug:tag when no provider config exists', async () => {
    const { service } = harness({ projectFound: false });
    const result = await service.resolveDockerImageRef('p1', 'main');
    expect(result).toContain(':main');
    expect(result).not.toContain('registry');
  });

  it('builds the full registry image ref when config exists', async () => {
    const { service } = harness();
    const result = await service.resolveDockerImageRef('p1', 'main');
    expect(result).toBe('registry.gl.io/org/app:main');
  });
});
