import { SourceProvidersService } from '../../source-providers/source-providers.service';
import { BuildImageService } from './build-image.service';

describe('BuildImageService.buildDockerImage', () => {
  let providers: { forService: jest.Mock; forProject: jest.Mock };
  let provider: { resolveDockerImageRef: jest.Mock };
  let svc: BuildImageService;

  beforeEach(() => {
    provider = {
      resolveDockerImageRef: jest
        .fn()
        .mockResolvedValue('registry/org/app:main'),
    };
    providers = {
      forService: jest.fn().mockResolvedValue(provider),
      forProject: jest.fn().mockResolvedValue(provider),
    };
    svc = new BuildImageService(providers as unknown as SourceProvidersService);
  });

  it('resolves via the SERVICE provider when a serviceId is given', async () => {
    const ref = await svc.buildDockerImage({
      projectId: 'p1',
      projectName: 'App',
      branch: 'main',
      serviceId: 's1',
    });
    expect(ref).toBe('registry/org/app:main');
    expect(providers.forService).toHaveBeenCalledWith('s1');
    expect(providers.forProject).not.toHaveBeenCalled();
  });

  it('falls back to the project provider without a serviceId', async () => {
    await svc.buildDockerImage({
      projectId: 'p1',
      projectName: 'App',
      branch: 'main',
    });
    expect(providers.forProject).toHaveBeenCalledWith('p1');
  });

  it('falls back to a sanitized {slug}:{tag} when resolution fails', async () => {
    providers.forProject.mockRejectedValue(new Error('no git config'));
    const ref = await svc.buildDockerImage({
      projectId: 'p1',
      projectName: 'My App',
      branch: 'feature/X',
    });
    // Sanitized — no spaces/uppercase issues, tag separated by ':'.
    expect(ref).toContain(':');
    expect(ref).not.toContain(' ');
  });
});
