import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { SourceType } from '@prisma/client';
import { of, throwError } from 'rxjs';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { GitlabFileService } from './gitlab-file.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeFullSvc(
  opts: {
    service?: object | null;
    gitProviderConfig?: object | null;
    gitProviderRepo?: object | null;
    httpGetResponses?: jest.Mock;
    httpPostResponses?: jest.Mock;
    httpPutResponses?: jest.Mock;
    decryptResult?: string;
  } = {},
) {
  const prisma = {
    service: {
      findFirst: jest.fn().mockResolvedValue(
        opts.service !== undefined
          ? opts.service
          : {
              id: 'svc1',
              projectId: 'proj1',
              providerId: 'prov1',
              branch: 'main',
              repoPath: 'group/repo',
              sourceType: SourceType.GIT_PROVIDER,
            },
      ),
      findUnique: jest.fn().mockResolvedValue({
        id: 'svc1',
        branch: 'main',
        repoPath: 'group/repo',
        providerId: 'prov1',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    gitProviderConfig: {
      findUnique: jest.fn().mockResolvedValue(
        opts.gitProviderConfig !== undefined
          ? opts.gitProviderConfig
          : {
              id: 'prov1',
              providerUrl: 'https://gitlab.com',
              adminToken: 'enc-token',
              oauthAccessToken: null,
            },
      ),
    },
    gitProviderRepo: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.gitProviderRepo !== undefined
            ? opts.gitProviderRepo
            : { repoPath: 'group/repo' },
        ),
    },
  } as unknown as PrismaService;

  const httpGet =
    opts.httpGetResponses ??
    jest
      .fn()
      .mockReturnValue(
        of({ data: { content: 'file content', encoding: 'utf-8' } }),
      );
  const httpPost =
    opts.httpPostResponses ?? jest.fn().mockReturnValue(of({ data: {} }));
  const httpPut =
    opts.httpPutResponses ?? jest.fn().mockReturnValue(of({ data: {} }));

  const httpService = {
    get: httpGet,
    post: httpPost,
    put: httpPut,
  } as unknown as HttpService;
  const crypto = {
    decrypt: jest.fn().mockReturnValue(opts.decryptResult ?? 'decrypted-token'),
  } as unknown as CryptoService;

  return {
    svc: new GitlabFileService(prisma, httpService, crypto),
    httpGet,
    httpPost,
    httpPut,
  };
}

function makeSvcWithContext(contextOverrides = {}) {
  const http = { get: jest.fn() };
  const svc = new GitlabFileService(
    {} as never,
    http as unknown as HttpService,
    {} as never,
  );
  jest
    .spyOn(
      svc as unknown as { resolveRepositoryContext: jest.Mock },
      'resolveRepositoryContext',
    )
    .mockResolvedValue({
      baseUrl: 'https://gitlab.com',
      gitlabProjectId: '42',
      token: 'tok',
      branch: 'main',
      repositoryPath: 'group/repo',
      sourceType: SourceType.GIT_PROVIDER,
      ...contextOverrides,
    });
  return { svc, http };
}

// ─── readFile ─────────────────────────────────────────────────────────────────

describe('GitlabFileService.readFile', () => {
  it('decodes a base64 file + sends PRIVATE-TOKEN and ref', async () => {
    const { svc, http } = makeSvcWithContext();
    http.get.mockReturnValue(
      of({
        data: {
          content: Buffer.from('hello world').toString('base64'),
          encoding: 'base64',
        },
      }),
    );
    const content = await svc.readFile('p1', 'Dockerfile', 'main');
    expect(content).toBe('hello world');
    const [url, opts] = http.get.mock.calls[0] as [
      string,
      { headers: Record<string, string>; params: Record<string, string> },
    ];
    expect(url).toContain('/api/v4/projects/42/repository/files/Dockerfile');
    expect(opts.headers['PRIVATE-TOKEN']).toBe('tok');
    expect(opts.params.ref).toBe('main');
  });

  it('returns plain content as-is when not base64', async () => {
    const { svc, http } = makeSvcWithContext();
    http.get.mockReturnValue(
      of({ data: { content: 'plain', encoding: 'text' } }),
    );
    expect(await svc.readFile('p1', 'f')).toBe('plain');
  });

  it('returns null on a 404 (file absent)', async () => {
    const { svc, http } = makeSvcWithContext();
    http.get.mockReturnValue(throwError(() => ({ response: { status: 404 } })));
    expect(await svc.readFile('p1', 'missing')).toBeNull();
  });

  it('throws UnauthorizedException on 401', async () => {
    const { svc, http } = makeSvcWithContext();
    http.get.mockReturnValue(throwError(() => ({ response: { status: 401 } })));
    await expect(svc.readFile('p1', 'file.ts')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

// ─── extractHttpStatus ────────────────────────────────────────────────────────

describe('GitlabFileService.extractHttpStatus', () => {
  const { svc } = makeFullSvc();

  it('extracts status from response.status', () => {
    expect(svc.extractHttpStatus({ response: { status: 404 } })).toBe(404);
  });

  it('extracts top-level status', () => {
    expect(svc.extractHttpStatus({ status: 422 })).toBe(422);
  });

  it('returns null for null', () => {
    expect(svc.extractHttpStatus(null)).toBeNull();
  });

  it('returns null when no status is found', () => {
    expect(svc.extractHttpStatus({ response: {} })).toBeNull();
  });
});

// ─── extractGitlabErrorMessage ────────────────────────────────────────────────

describe('GitlabFileService.extractGitlabErrorMessage', () => {
  const { svc } = makeFullSvc();

  it('extracts message string from response.data.message', () => {
    expect(
      svc.extractGitlabErrorMessage({
        response: { data: { message: 'branch not found' } },
      }),
    ).toBe('branch not found');
  });

  it('extracts plain string body', () => {
    expect(
      svc.extractGitlabErrorMessage({ response: { data: 'plain error' } }),
    ).toBe('plain error');
  });

  it('joins message array', () => {
    const result = svc.extractGitlabErrorMessage({
      response: { data: { message: ['A', 'B'] } },
    });
    expect(result).toBe('A, B');
  });

  it('returns fallback for empty/unknown shape', () => {
    expect(svc.extractGitlabErrorMessage({})).toBe('Erreur GitLab inconnue.');
  });
});

// ─── throwGitlabMappedError ───────────────────────────────────────────────────

describe('GitlabFileService.throwGitlabMappedError', () => {
  const { svc } = makeFullSvc();

  it('throws UnauthorizedException on 401', () => {
    expect(() =>
      svc.throwGitlabMappedError('act', { response: { status: 401 } }, 'fb'),
    ).toThrow(UnauthorizedException);
  });
  it('throws ForbiddenException on 403', () => {
    expect(() =>
      svc.throwGitlabMappedError('act', { response: { status: 403 } }, 'fb'),
    ).toThrow(ForbiddenException);
  });
  it('throws NotFoundException on 404', () => {
    expect(() =>
      svc.throwGitlabMappedError('act', { response: { status: 404 } }, 'fb'),
    ).toThrow(NotFoundException);
  });
  it('throws ConflictException on 409', () => {
    expect(() =>
      svc.throwGitlabMappedError('act', { response: { status: 409 } }, 'fb'),
    ).toThrow(ConflictException);
  });
  it('throws UnprocessableEntityException on 422', () => {
    expect(() =>
      svc.throwGitlabMappedError('act', { response: { status: 422 } }, 'fb'),
    ).toThrow(UnprocessableEntityException);
  });
  it('throws BadRequestException for unknown codes', () => {
    expect(() =>
      svc.throwGitlabMappedError('act', { response: { status: 500 } }, 'fb'),
    ).toThrow(BadRequestException);
  });
});

// ─── resolveGitCredentials ─────────────────────────────────────────────────────

describe('GitlabFileService.resolveGitCredentials', () => {
  it('returns repoUrl and decrypted token', async () => {
    const { svc } = makeFullSvc();
    const result = await svc.resolveGitCredentials('proj1');
    expect(result.repoUrl).toContain('group/repo.git');
    expect(result.token).toBe('decrypted-token');
  });

  it('throws BadRequestException when repositoryPath is null', async () => {
    const { svc } = makeFullSvc({
      service: {
        id: 'svc1',
        providerId: 'prov1',
        branch: 'main',
        repoPath: null,
        sourceType: SourceType.GIT_PROVIDER,
      },
      gitProviderRepo: null,
    });
    await expect(svc.resolveGitCredentials('proj1')).rejects.toThrow(
      BadRequestException,
    );
  });
});

// ─── writeFiles ────────────────────────────────────────────────────────────────

describe('GitlabFileService.writeFiles', () => {
  it('throws ForbiddenException for non-whitelisted files', async () => {
    const { svc } = makeFullSvc();
    await expect(
      svc.writeFiles('proj1', { 'package.json': '{}' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('creates a new Dockerfile and returns CREATED', async () => {
    const httpGet = jest
      .fn()
      .mockReturnValueOnce(
        of({ data: { default_branch: 'main', permissions: null } }),
      ) // project check
      .mockReturnValueOnce(of({ data: {} })) // branch exists
      .mockReturnValueOnce(throwError(() => ({ response: { status: 404 } }))); // file does not exist
    const { svc } = makeFullSvc({ httpGetResponses: httpGet });
    const result = await svc.writeFiles('proj1', {
      Dockerfile: 'FROM node:20',
    });
    expect(result.fileStatuses['Dockerfile']).toBe('CREATED');
  });

  it('updates an existing Dockerfile and returns UPDATED', async () => {
    const httpGet = jest
      .fn()
      .mockReturnValueOnce(
        of({ data: { default_branch: 'main', permissions: null } }),
      ) // project check
      .mockReturnValueOnce(of({ data: {} })) // branch exists
      .mockReturnValueOnce(of({ data: {} })); // file exists
    const { svc } = makeFullSvc({ httpGetResponses: httpGet });
    const result = await svc.writeFiles('proj1', {
      Dockerfile: 'FROM node:18',
    });
    expect(result.fileStatuses['Dockerfile']).toBe('UPDATED');
  });
});

// ─── resolveRepositoryContext ──────────────────────────────────────────────────

describe('GitlabFileService.resolveRepositoryContext', () => {
  it('throws BadRequestException when no service with providerId exists', async () => {
    const { svc } = makeFullSvc({ service: null });
    await expect(svc.resolveRepositoryContext('proj1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when gitProviderConfig not found', async () => {
    const { svc } = makeFullSvc({ gitProviderConfig: null });
    await expect(svc.resolveRepositoryContext('proj1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws UnauthorizedException when decrypted token is empty', async () => {
    const { svc } = makeFullSvc({ decryptResult: '   ' });
    await expect(svc.resolveRepositoryContext('proj1')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('resolves context successfully', async () => {
    const { svc } = makeFullSvc();
    const ctx = await svc.resolveRepositoryContext('proj1');
    expect(ctx.baseUrl).toBe('https://gitlab.com');
    expect(ctx.branch).toBe('main');
    expect(ctx.gitlabProjectId).toBe('group/repo');
  });

  // Mission B (déploiement réel) : sur un projet MULTI-DÉPÔTS, le contexte
  // doit résoudre LE service demandé — l'ancien findFirst({projectId}) prenait
  // un service arbitraire (ordre physique du heap) → le check Dockerfile du
  // backend interrogeait le dépôt du frontend (404 → faux « pas de Dockerfile »).
  it('resolves the REQUESTED service repo when serviceId is provided (multi-repo project)', async () => {
    const { svc } = makeFullSvc({
      service: {
        id: 'svc-backend',
        projectId: 'proj1',
        providerId: 'prov1',
        branch: 'fix-branch',
        repoPath: 'group/backend-repo',
        sourceType: SourceType.GIT_PROVIDER,
      },
    });
    const prisma = (
      svc as unknown as { prisma: { service: { findFirst: jest.Mock } } }
    ).prisma;
    const ctx = await svc.resolveRepositoryContext('proj1', 'svc-backend');
    // La requête cible bien id+projectId (pas un findFirst arbitraire du projet)
    expect(prisma.service.findFirst).toHaveBeenCalledWith({
      where: { id: 'svc-backend', projectId: 'proj1' },
    });
    expect(ctx.gitlabProjectId).toBe('group/backend-repo');
  });
});
