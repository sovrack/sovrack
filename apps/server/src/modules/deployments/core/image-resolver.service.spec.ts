import { ImageResolverService } from './image-resolver.service';

describe('ImageResolverService.resolveImageRef', () => {
  // resolveImageRef is pure (no I/O): we can pass empty deps.
  const svc = new ImageResolverService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const base = {
    id: 'deadbeefcafe',
    project: { id: 'p1', name: 'My App' },
    branch: 'main',
  };

  it('prefers the explicit override image', () => {
    expect(svc.resolveImageRef(base, 'registry/x:1')).toBe('registry/x:1');
  });

  it('uses the already-pinned dockerImage when present', () => {
    expect(svc.resolveImageRef({ ...base, dockerImage: 'pinned:2' })).toBe(
      'pinned:2',
    );
  });

  it('builds a unique local tag per deployment for local builds (slugified)', () => {
    const ref = svc.resolveImageRef({
      ...base,
      build: { isLocalBuild: true },
      service: { name: 'Web Front' },
    });
    expect(ref).toBe('local/my-app-web-front:deadbeef');
  });

  it('uses the registry sha when a build imageSha is available', () => {
    const ref = svc.resolveImageRef({
      ...base,
      build: { imageSha: 'abc123' },
    });
    expect(ref).toBe('platform/p1:abc123');
  });

  it('falls back to platform/<project>:<branch>', () => {
    expect(svc.resolveImageRef(base)).toBe('platform/p1:main');
  });
});
