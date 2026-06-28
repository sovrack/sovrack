import { Server, ServiceType } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { TraefikRouteService } from './traefik-route.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { DeployRoutingService } from './deploy-routing.service';

/**
 * Unit coverage for the two pre/post-deploy routing helpers:
 * - resolveTraefikConfig: explicit domain → auto-subdomain fallback → none
 * - applyRoute: success path + non-fatal error path (both emit to the gateway)
 */
describe('DeployRoutingService — resolveTraefikConfig & applyRoute', () => {
  function build(overrides?: {
    domain?: { name: string } | null;
    autoSubdomain?: string | null;
    applyRouteImpl?: jest.Mock;
  }) {
    const prisma = {
      domain: {
        findFirst: jest.fn().mockResolvedValue(overrides?.domain ?? null),
      },
    } as unknown as PrismaService;
    const traefik = {
      resolveAutoSubdomain: jest
        .fn()
        .mockResolvedValue(overrides?.autoSubdomain ?? null),
      applyRoute:
        overrides?.applyRouteImpl ??
        jest.fn().mockResolvedValue('[TRAEFIK] route appliquée'),
    } as unknown as TraefikRouteService;
    const docker = {} as unknown as DockerApiService;
    const gateway = {
      emitLog: jest.fn(),
    } as unknown as DeploymentEventsPublisher;
    const routing = new DeployRoutingService(prisma, traefik, docker, gateway);
    return { routing, prisma, traefik, gateway };
  }

  const appDeployment = {
    project: { id: 'proj-1' },
    service: { type: ServiceType.APPLICATION },
    serviceEnv: { id: 'se-1', environment: { name: 'production' } },
  };

  describe('resolveTraefikConfig', () => {
    it('uses an explicit domain when one is attached', async () => {
      const { routing, traefik } = build({
        domain: { name: 'app.example.com' },
      });
      const cfg = await routing.resolveTraefikConfig(
        appDeployment,
        [{ host: '1.2.3.4' }],
        'web',
      );
      expect(cfg).toEqual({
        traefikDomain: 'app.example.com',
        traefikServiceEnvId: 'se-1',
        useTraefik: true,
      });
      expect(traefik.resolveAutoSubdomain).not.toHaveBeenCalled();
    });

    it('falls back to an auto-subdomain for APPLICATION services', async () => {
      const { routing, traefik } = build({
        domain: null,
        autoSubdomain: 'web-prod.apps.example.com',
      });
      const cfg = await routing.resolveTraefikConfig(
        appDeployment,
        [{ host: '1.2.3.4' }],
        'web',
      );
      expect(cfg.traefikDomain).toBe('web-prod.apps.example.com');
      expect(cfg.useTraefik).toBe(true);
      expect(traefik.resolveAutoSubdomain).toHaveBeenCalledWith(
        'proj-1',
        'se-1',
        'web',
        'production',
        '1.2.3.4',
      );
    });

    it('returns no domain when none is attached and no auto-subdomain resolves', async () => {
      const { routing } = build({ domain: null, autoSubdomain: null });
      const cfg = await routing.resolveTraefikConfig(
        appDeployment,
        [{ host: '1.2.3.4' }],
        'web',
      );
      expect(cfg).toEqual({
        traefikDomain: null,
        traefikServiceEnvId: 'se-1',
        useTraefik: false,
      });
    });

    it('never routes a DATABASE service (no domain lookup, no auto-subdomain)', async () => {
      const { routing, prisma, traefik } = build();
      const cfg = await routing.resolveTraefikConfig(
        {
          project: { id: 'proj-1' },
          service: { type: ServiceType.DATABASE },
          serviceEnv: { id: 'se-1', environment: { name: 'production' } },
        },
        [{ host: '1.2.3.4' }],
        'db',
      );
      expect(cfg.useTraefik).toBe(false);
      expect(cfg.traefikDomain).toBeNull();
      expect(prisma.domain.findFirst).not.toHaveBeenCalled();
      expect(traefik.resolveAutoSubdomain).not.toHaveBeenCalled();
    });

    it('returns null serviceEnvId when there is no serviceEnv', async () => {
      const { routing } = build();
      const cfg = await routing.resolveTraefikConfig(
        {
          project: { id: 'proj-1' },
          service: { type: ServiceType.APPLICATION },
        },
        [],
        'web',
      );
      expect(cfg).toEqual({
        traefikDomain: null,
        traefikServiceEnvId: null,
        useTraefik: false,
      });
    });
  });

  describe('applyRoute', () => {
    const params = {
      deploymentId: 'dep-1',
      serverId: 'srv-1',
      server: { id: 'srv-1' } as Server,
      serviceEnvId: 'se-1',
      traefikDomain: 'app.example.com',
      containerName: 'app-abc',
      servicePort: 3000,
    };

    it('applies the route and emits an info log on success', async () => {
      const { routing, gateway } = build();
      const log = await routing.applyRoute(params);
      expect(log).toContain('[TRAEFIK] route appliquée');
      expect(gateway.emitLog).toHaveBeenCalledWith(
        expect.objectContaining({ deploymentId: 'dep-1', level: 'info' }),
      );
    });

    it('swallows route errors (non-fatal) and emits an error log', async () => {
      const failing = jest.fn().mockRejectedValue(new Error('proxy down'));
      const { routing, gateway } = build({ applyRouteImpl: failing });
      const log = await routing.applyRoute(params);
      expect(log).toContain('[TRAEFIK] Route non configurée: proxy down');
      expect(gateway.emitLog).toHaveBeenCalledWith(
        expect.objectContaining({ deploymentId: 'dep-1', level: 'error' }),
      );
    });
  });
});
