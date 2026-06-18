import { BadRequestException } from '@nestjs/common';
import { SourceType } from '@prisma/client';
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
      cfg({ sourceType: SourceType.GIT, repoPath: 'grp/app', externalId: null }),
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
