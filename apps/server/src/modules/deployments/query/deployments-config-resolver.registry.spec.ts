import {
  DeploymentsConfigResolver,
  ResolverService,
  ResolverProject,
} from './deployments-config-resolver.service';

describe('DeploymentsConfigResolver — mode REGISTRY (registryImage)', () => {
  const buildDockerImage = jest.fn().mockResolvedValue('derived/image:sha');
  const resolver = new DeploymentsConfigResolver({
    buildDockerImage,
  } as never);

  const project: ResolverProject = { id: 'p1', name: 'proj' };
  const baseService: ResolverService = {
    id: 's1',
    name: 'svc',
    branch: 'main',
    buildPack: 'DOCKERFILE',
    buildMode: 'REGISTRY',
    sourceType: 'GIT',
  };

  beforeEach(() => buildDockerImage.mockClear());

  it('tire registryImage tel quel quand il est défini (pas de dérivation CI)', async () => {
    const cfg = await resolver.resolve(
      {} as never,
      { ...baseService, registryImage: 'registry.gitlab.com/grp/app:1.2.3' },
      project,
    );
    expect(cfg.dockerImage).toBe('registry.gitlab.com/grp/app:1.2.3');
    expect(buildDockerImage).not.toHaveBeenCalled();
  });

  it('dérive l’image via la CI quand registryImage est vide', async () => {
    const cfg = await resolver.resolve(
      {} as never,
      { ...baseService, registryImage: '   ' },
      project,
    );
    expect(buildDockerImage).toHaveBeenCalledTimes(1);
    expect(cfg.dockerImage).toBe('derived/image:sha');
  });
});
