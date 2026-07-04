import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SourceType } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import {
  GitlabProjectConfigService,
  GitlabResolvedConfig,
} from './gitlab-project-config.service';

// Config minimale valide (providerUrl/providerToken requis par le type).
const cfg = (p: Partial<GitlabResolvedConfig>): GitlabResolvedConfig => ({
  providerUrl: 'https://gitlab.com',
  providerToken: 'tok',
  ...p,
});

describe('GitlabProjectConfigService.assertRepoSource', () => {
  // assertRepoSource est pure (n'utilise que `config`) → instanciation sans DI.
  const svc = new GitlabProjectConfigService(
    null as never,
    null as never,
    null as never,
  );

  it('retombe sur repoPath quand externalId est absent (régression 404 /projects/0)', () => {
    const repoId = svc.assertRepoSource(
      cfg({
        sourceType: SourceType.GIT,
        repoPath: 'grp/app',
        externalId: null,
      }),
      'récupération des pipelines',
    );
    expect(repoId).toBe('grp/app');
  });

  it('utilise l’ID numérique quand il est valide', () => {
    const repoId = svc.assertRepoSource(
      cfg({ sourceType: SourceType.GIT, repoPath: 'grp/app', externalId: 42 }),
      'action',
    );
    expect(repoId).toBe(42);
  });

  it('ignore un externalId 0/invalide et garde repoPath', () => {
    expect(
      svc.assertRepoSource(
        cfg({ sourceType: SourceType.GIT, repoPath: 'grp/app', externalId: 0 }),
        'action',
      ),
    ).toBe('grp/app');
  });

  it('rejette une source non-GIT (groupe) ou sans repoPath', () => {
    expect(() =>
      svc.assertRepoSource(
        cfg({ sourceType: SourceType.GIT, repoPath: '', externalId: null }),
        'action',
      ),
    ).toThrow(BadRequestException);
  });
});

// Bug B3 (RAPPORT_DEPLOIEMENT_REEL.md, recommandation) : pour un projet
// multi-services, getProjectConfig() résolvait le dépôt via un `findFirst`
// SANS orderBy — arbitraire, live-confirmé pour retourner systématiquement
// les branches du même service quel que soit celui réellement en cours de
// configuration. Corrigé pour accepter un `serviceId` explicite, qui doit
// primer sur toute résolution "au hasard".
describe('GitlabProjectConfigService.getProjectConfig — résolution multi-services (B3)', () => {
  const backendService = {
    id: 'svc-backend',
    projectId: 'proj-1',
    providerId: 'prov-1',
    sourceType: SourceType.GIT,
    repoPath: 'group/app-backend',
    branch: 'dev',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const frontendService = {
    id: 'svc-frontend',
    projectId: 'proj-1',
    providerId: 'prov-1',
    sourceType: SourceType.GIT,
    repoPath: 'group/app-frontend',
    branch: 'main',
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
  };
  const providerConfig = {
    id: 'prov-1',
    providerUrl: 'https://gitlab.example.com',
    adminToken: 'tok',
    oauthAccessToken: null,
  };

  function makeService(findFirstImpl: jest.Mock) {
    const prisma = {
      service: { findFirst: findFirstImpl },
      gitProviderConfig: {
        findUnique: jest.fn().mockResolvedValue(providerConfig),
      },
    };
    const svc = new GitlabProjectConfigService(
      prisma as unknown as PrismaService,
      null as never,
      null as never,
    );
    return { svc, prisma };
  }

  it('avec serviceId : résout EXACTEMENT le service demandé, pas un autre du même projet', async () => {
    const findFirst = jest.fn().mockImplementation(({ where }) => {
      // Simule Prisma : ne retourne que le service dont l'id matche le filtre.
      const candidates = [backendService, frontendService];
      return Promise.resolve(
        candidates.find(
          (s) => s.id === where.id && s.projectId === where.projectId,
        ) ?? null,
      );
    });
    const { svc } = makeService(findFirst);

    const config = await svc.getProjectConfig('proj-1', 'svc-frontend');
    expect(config.repoPath).toBe('group/app-frontend');
    expect(config.defaultBranch).toBe('main');

    const configBackend = await svc.getProjectConfig('proj-1', 'svc-backend');
    expect(configBackend.repoPath).toBe('group/app-backend');
    expect(configBackend.defaultBranch).toBe('dev');
  });

  it('sans serviceId : retombe sur un choix déterministe (le plus ancien), pas arbitraire', async () => {
    // Peu importe l'ordre dans lequel Prisma "retournerait" les lignes ici —
    // le orderBy est passé explicitement ; on vérifie qu'il est bien demandé
    // et qu'on résout bien le plus ancien des deux candidats fournis.
    const findFirst = jest.fn().mockImplementation(({ orderBy }) => {
      expect(orderBy).toEqual({ createdAt: 'asc' });
      return Promise.resolve(backendService); // le plus ancien des deux
    });
    const { svc } = makeService(findFirst);

    const config = await svc.getProjectConfig('proj-1');
    expect(config.repoPath).toBe('group/app-backend');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'proj-1', providerId: { not: null } },
        orderBy: { createdAt: 'asc' },
      }),
    );
  });

  it('rejette un serviceId qui ne correspond à aucun service du projet', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const { svc } = makeService(findFirst);

    await expect(
      svc.getProjectConfig('proj-1', 'svc-does-not-exist'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
