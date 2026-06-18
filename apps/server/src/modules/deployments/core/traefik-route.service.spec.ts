import { TraefikRouteService } from './traefik-route.service';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * Couvre la logique de sous-domaine automatique (Phase 5) : base domain explicite,
 * fallback nip.io, désactivé, et slugification.
 */
describe('TraefikRouteService.resolveAutoSubdomain', () => {
  function makeService(config: Record<string, string | undefined>) {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      platformConfig: {
        findUnique: jest.fn(({ where }: { where: { key: string } }) =>
          Promise.resolve(
            config[where.key] !== undefined
              ? { value: config[where.key] }
              : null,
          ),
        ),
      },
      domain: { upsert },
    } as unknown as PrismaService;
    const service = new TraefikRouteService(
      prisma,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, upsert };
  }

  it('uses PLATFORM_BASE_DOMAIN when set', async () => {
    const { service, upsert } = makeService({
      PLATFORM_BASE_DOMAIN: 'apps.example.com',
    });
    const domain = await service.resolveAutoSubdomain(
      'p1',
      'se1',
      'My-Frontend',
      'PRODUCTION',
      '10.0.0.1',
    );
    expect(domain).toBe('my-frontend-production.apps.example.com');
    expect(upsert).toHaveBeenCalled();
  });

  it('falls back to nip.io when PLATFORM_AUTO_SUBDOMAIN is true and host is an IP', async () => {
    const { service } = makeService({ PLATFORM_AUTO_SUBDOMAIN: 'true' });
    const domain = await service.resolveAutoSubdomain(
      'p1',
      'se1',
      'api',
      'staging',
      '192.168.122.30',
    );
    expect(domain).toBe('api-staging.192.168.122.30.nip.io');
  });

  it('returns null when neither base domain nor auto flag is set', async () => {
    const { service, upsert } = makeService({});
    const domain = await service.resolveAutoSubdomain(
      'p1',
      'se1',
      'api',
      'prod',
      '192.168.122.30',
    );
    expect(domain).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does not use nip.io for a non-IP host', async () => {
    const { service } = makeService({ PLATFORM_AUTO_SUBDOMAIN: 'true' });
    const domain = await service.resolveAutoSubdomain(
      'p1',
      'se1',
      'api',
      'prod',
      'some-hostname',
    );
    expect(domain).toBeNull();
  });
});
