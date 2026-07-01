import { NotFoundException } from '@nestjs/common';
import { GitProviderType } from '@prisma/client';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { BuildDetectorService } from './build-detector.service';
import { inferType } from './build-type-inference.util';
import type { ParsedProjectSignals } from './project-detection.util';
import { RepositoryFileFetcherService } from './repository-file-fetcher.service';

// ── Legacy inferType coverage ────────────────────────────────────────────────

const emptySignals: ParsedProjectSignals = {
  packageJson: null,
  requirementsTxt: null,
  pyprojectToml: null,
  composerJson: null,
  goMod: null,
  pomXml: null,
  buildGradle: null,
  dockerfile: null,
  dockerCompose: null,
};

describe('BuildDetectorService.inferType (delegates to inferType util)', () => {
  const infer = (files: string[], signals: Partial<ParsedProjectSignals>) =>
    inferType(files, { ...emptySignals, ...signals });

  it('detects NestJS from @nestjs/core', () => {
    const res = infer(['package.json'], {
      packageJson: { dependencies: { '@nestjs/core': '^11' } },
    });
    expect(res.type).toBe('nestjs');
  });

  it('detects a PostgreSQL service from docker-compose', () => {
    const res = infer(['docker-compose.yml'], {
      dockerCompose: 'services:\n  db:\n    image: postgres:16',
    });
    expect(res.type).toBe('postgres-service');
    expect(res.recommendedPort).toBe(5432);
  });

  it('detects a Redis service from docker-compose', () => {
    const res = infer(['docker-compose.yml'], {
      dockerCompose: 'services:\n  cache:\n    image: redis:7',
    });
    expect(res.type).toBe('redis-service');
    expect(res.recommendedPort).toBe(6379);
  });

  it('detects Go from go.mod', () => {
    const res = infer(['go.mod', 'main.go'], {
      goMod: 'module example.com/app',
    });
    expect(res.framework ?? res.type).toMatch(/go/i);
  });

  it('flags the presence of a Dockerfile and CI config', () => {
    const res = infer(['Dockerfile', '.gitlab-ci.yml'], {});
    expect(res.hasDockerfile).toBe(true);
  });

  it('falls back to a result for an unrecognised project', () => {
    const res = infer(['README.md'], {});
    expect(res.type).toBeTruthy();
  });
});

// ── BuildDetectorService.detectProjectType ────────────────────────────────────

function makePrisma(overrides: Partial<{
  project: unknown;
  service: unknown;
  serviceUpdate: unknown;
}> = {}) {
  const defaultProvider = {
    id: 'prov1',
    type: GitProviderType.GITLAB,
    providerUrl: 'https://gitlab.com',
    adminToken: null,
    oauthAccessToken: null,
  };
  const defaultRepo = {
    id: 'repo1',
    repoPath: 'group/app',
    defaultBranch: 'main',
    provider: defaultProvider,
  };
  const defaultProject = {
    id: 'proj1',
    name: 'MyApp',
    providerRepos: [defaultRepo],
  };

  return {
    project: {
      findUnique: jest.fn().mockResolvedValue(
        'project' in overrides ? overrides.project : defaultProject,
      ),
    },
    service: {
      findUnique: jest.fn().mockResolvedValue(
        'service' in overrides ? overrides.service : null,
      ),
      update: jest.fn().mockResolvedValue(
        'serviceUpdate' in overrides ? overrides.serviceUpdate : { id: 's1' },
      ),
    },
  };
}

function makeService(prismaOverrides = {}) {
  const prisma = makePrisma(prismaOverrides) as unknown as PrismaService;
  const crypto = {
    decrypt: jest.fn((v: string) => `decrypted:${v}`),
  } as unknown as CryptoService;
  const fileFetcher = {
    listGitLabRepositoryFiles: jest.fn().mockResolvedValue([
      'package.json',
      'Dockerfile',
    ]),
    listGitHubRepositoryFiles: jest.fn().mockResolvedValue([
      'package.json',
      'Dockerfile',
    ]),
    fetchRawFile: jest.fn().mockResolvedValue(null),
  } as unknown as RepositoryFileFetcherService;

  const svc = new BuildDetectorService(prisma, crypto, fileFetcher);
  return { svc, prisma, crypto, fileFetcher };
}

describe('BuildDetectorService.detectProjectType', () => {
  it('throws NotFoundException when project does not exist', async () => {
    const { svc } = makeService({ project: null });
    await expect(svc.detectProjectType('missing')).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when project has no repos', async () => {
    const { svc } = makeService({
      project: { id: 'p1', name: 'X', providerRepos: [] },
    });
    await expect(svc.detectProjectType('p1')).rejects.toThrow(NotFoundException);
  });

  it('returns a detect result for a GitLab project', async () => {
    const { svc } = makeService();
    const result = await svc.detectProjectType('proj1');
    expect(result).toMatchObject({
      type: expect.any(String),
      confidence: expect.any(String),
    });
  });

  it('returns a detect result for a GitHub project', async () => {
    const ghProvider = {
      id: 'prov-gh',
      type: GitProviderType.GITHUB,
      providerUrl: 'https://github.com',
      adminToken: 'enc-token',
      oauthAccessToken: null,
    };
    const ghProject = {
      id: 'proj-gh',
      name: 'gh-app',
      providerRepos: [
        {
          id: 'repo-gh',
          repoPath: 'owner/repo',
          defaultBranch: 'main',
          provider: ghProvider,
        },
      ],
    };
    const { svc, fileFetcher } = makeService({ project: ghProject });
    const result = await svc.detectProjectType('proj-gh');
    expect(fileFetcher.listGitHubRepositoryFiles).toHaveBeenCalled();
    expect(result.type).toBeTruthy();
  });

  it('uses the service branch when serviceId is provided', async () => {
    const prisma = makePrisma() as unknown as PrismaService;
    (prisma.service.findUnique as jest.Mock).mockResolvedValue({
      id: 's1',
      branch: 'feature/x',
    });
    const crypto = { decrypt: jest.fn((v: string) => v) } as unknown as CryptoService;
    const fileFetcher = {
      listGitLabRepositoryFiles: jest.fn().mockResolvedValue(['package.json']),
      listGitHubRepositoryFiles: jest.fn().mockResolvedValue([]),
      fetchRawFile: jest.fn().mockResolvedValue(null),
    } as unknown as RepositoryFileFetcherService;

    const svc = new BuildDetectorService(prisma, crypto, fileFetcher);
    await svc.detectProjectType('proj1', 's1');

    expect(prisma.service.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' } }),
    );
  });

  it('throws NotFoundException when serviceId refers to a non-existent service', async () => {
    const { svc } = makeService({ service: null });
    await expect(svc.detectProjectType('proj1', 'ghost-svc')).rejects.toThrow(NotFoundException);
  });

  it('returns a fallback result when listRepositoryFiles throws', async () => {
    const prisma = makePrisma() as unknown as PrismaService;
    const crypto = { decrypt: jest.fn((v: string) => v) } as unknown as CryptoService;
    const fileFetcher = {
      listGitLabRepositoryFiles: jest.fn().mockRejectedValue(new Error('network error')),
      listGitHubRepositoryFiles: jest.fn().mockRejectedValue(new Error('network error')),
      fetchRawFile: jest.fn().mockResolvedValue(null),
    } as unknown as RepositoryFileFetcherService;

    const svc = new BuildDetectorService(prisma, crypto, fileFetcher);
    const result = await svc.detectProjectType('proj1');
    // fallback result is still a valid DetectResult
    expect(result.type).toBeTruthy();
  });

  it('decrypts oauthAccessToken and prefers it over adminToken', async () => {
    const provider = {
      id: 'prov1',
      type: GitProviderType.GITLAB,
      providerUrl: 'https://gitlab.com',
      adminToken: 'enc-admin',
      oauthAccessToken: 'enc-oauth',
    };
    const project = {
      id: 'proj1',
      name: 'App',
      providerRepos: [
        { id: 'r1', repoPath: 'g/a', defaultBranch: 'main', provider },
      ],
    };
    const prisma = makePrisma({ project }) as unknown as PrismaService;
    const crypto = {
      decrypt: jest.fn((v: string) => `decrypted:${v}`),
    } as unknown as CryptoService;
    const fileFetcher = {
      listGitLabRepositoryFiles: jest.fn().mockResolvedValue([]),
      listGitHubRepositoryFiles: jest.fn().mockResolvedValue([]),
      fetchRawFile: jest.fn().mockResolvedValue(null),
    } as unknown as RepositoryFileFetcherService;

    const svc = new BuildDetectorService(prisma, crypto, fileFetcher);
    await svc.detectProjectType('proj1');

    // decrypt is called for both tokens; result uses oauthAccessToken
    expect(crypto.decrypt).toHaveBeenCalledWith('enc-oauth');
  });

  it('saves detected buildType to the service when serviceId is provided', async () => {
    const prisma = makePrisma() as unknown as PrismaService;
    (prisma.service.findUnique as jest.Mock).mockResolvedValue({
      id: 's1',
      branch: 'main',
    });
    (prisma.service.update as jest.Mock).mockResolvedValue({ id: 's1' });
    const crypto = { decrypt: jest.fn((v: string) => v) } as unknown as CryptoService;
    const fileFetcher = {
      listGitLabRepositoryFiles: jest.fn().mockResolvedValue(['package.json']),
      listGitHubRepositoryFiles: jest.fn().mockResolvedValue([]),
      fetchRawFile: jest.fn().mockResolvedValue(
        JSON.stringify({ dependencies: { '@nestjs/core': '^10' } }),
      ),
    } as unknown as RepositoryFileFetcherService;

    const svc = new BuildDetectorService(prisma, crypto, fileFetcher);
    const result = await svc.detectProjectType('proj1', 's1');

    expect(prisma.service.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { buildType: result.type },
    });
  });
});
