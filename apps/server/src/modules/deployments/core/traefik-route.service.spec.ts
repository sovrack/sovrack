import { TraefikRouteService } from './traefik-route.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { SshExecutorService } from '../../../adapters/ssh/ssh-executor.service';
import { ServersCryptoService } from '../../../adapters/ssh/servers-crypto.service';
import { ServerHostKeyService } from '../../../adapters/ssh/server-host-key.service';

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

  it('falls back to process.env.PLATFORM_BASE_DOMAIN when not present in DB', async () => {
    const prev = process.env.PLATFORM_BASE_DOMAIN;
    process.env.PLATFORM_BASE_DOMAIN = 'apps.sovrack.tech';
    try {
      const { service, upsert } = makeService({});
      const domain = await service.resolveAutoSubdomain(
        'p1',
        'se1',
        'My-Store',
        'PROD',
        '10.0.0.1',
      );
      expect(domain).toBe('my-store-prod.apps.sovrack.tech');
      expect(upsert).toHaveBeenCalled();
    } finally {
      if (prev !== undefined) {
        process.env.PLATFORM_BASE_DOMAIN = prev;
      } else {
        delete process.env.PLATFORM_BASE_DOMAIN;
      }
    }
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

describe('TraefikRouteService.applyRoute', () => {
  function build() {
    const docker = {
      createNetwork: jest.fn().mockResolvedValue(undefined),
      connectNetwork: jest.fn().mockResolvedValue(undefined),
    } as unknown as DockerApiService;
    const conn = {
      client: {},
      dispose: jest.fn().mockResolvedValue(undefined),
    };
    const ssh = {
      connect: jest.fn().mockResolvedValue(conn),
      execOrThrow: jest.fn().mockResolvedValue(undefined),
    } as unknown as SshExecutorService;
    const serversCrypto = {
      decrypt: jest.fn().mockReturnValue('PEM-KEY'),
    } as unknown as ServersCryptoService;
    const serverHostKeys = {
      resolveForConnection: jest
        .fn()
        .mockResolvedValue({ keyBase64: 'host-key' }),
    } as unknown as ServerHostKeyService;
    const service = new TraefikRouteService(
      {} as unknown as PrismaService,
      docker,
      ssh,
      serversCrypto,
      serverHostKeys,
    );
    const server = {
      host: '10.0.0.1',
      port: 22,
      username: 'deploy',
      sshKey: 'enc-key',
    };
    return {
      service,
      docker,
      ssh,
      serversCrypto,
      serverHostKeys,
      conn,
      server,
    };
  }

  it('joins the web network, writes the dynamic config, returns the HTTPS url', async () => {
    const { service, docker, ssh, conn } = build();
    const result = await service.applyRoute(
      'srv-1',
      build().server as never,
      'env/weird id', // contains chars to sanitize
      'app.example.com',
      'deploy-app',
      3000,
    );

    expect(docker.createNetwork).toHaveBeenCalledWith('srv-1', 'web');
    expect(docker.connectNetwork).toHaveBeenCalledWith(
      'srv-1',
      'web',
      'deploy-app',
    );
    // connect pins the resolved host key (no TOFU).
    expect(ssh.connect).toHaveBeenCalledWith(
      expect.objectContaining({ expectedHostKey: 'host-key' }),
    );

    // The dynamic config is shipped base64-encoded; decode it from the command
    // and assert it carries the Host rule, the sanitized id, and the backend url.
    const cmd = (ssh.execOrThrow as jest.Mock).mock.calls[0][1] as string;
    expect(cmd).toContain('env-weird-id.yml'); // id sanitized for the filename
    const b64 = cmd.match(/echo ([A-Za-z0-9+/=]+) \| base64 -d/)?.[1];
    expect(b64).toBeDefined();
    const yaml = Buffer.from(b64 as string, 'base64').toString('utf8');
    expect(yaml).toContain('Host(`app.example.com`)');
    expect(yaml).toContain('certResolver: le');
    expect(yaml).toContain('url: "http://deploy-app:3000"');

    expect(conn.dispose).toHaveBeenCalled();
    expect(result).toBe(
      '[TRAEFIK] Route HTTPS configurée : https://app.example.com',
    );
  });

  it('tolerates an existing web network (createNetwork rejection swallowed)', async () => {
    const { service, docker, ssh } = build();
    (docker.createNetwork as jest.Mock).mockRejectedValueOnce(
      new Error('network web already exists'),
    );
    await expect(
      service.applyRoute(
        'srv-1',
        build().server as never,
        'se1',
        'app.example.com',
        'deploy-app',
        3000,
      ),
    ).resolves.toContain('https://app.example.com');
    expect(ssh.execOrThrow).toHaveBeenCalled(); // proceeded past the create
  });
});
