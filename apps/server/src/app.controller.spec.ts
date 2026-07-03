import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaService } from './shared/database/prisma.service';
import { PlatformService } from './modules/platform/platform.service';

// Regression test for AUDIT_VERIFICATION_UI.md Point 1: AppController is
// exempted from the global ThrottlerGuard. Without this, the guard's
// Redis-backed storage would itself call Redis on every request — including
// the health probe reporting on whether Redis is reachable — and hang for a
// long time (ioredis' default retry/backoff) instead of the controller ever
// getting a chance to return a clean "disconnected" status.
describe('AppController — exempt from rate limiting', () => {
  it('carries the SkipThrottle metadata', () => {
    expect(Reflect.getMetadata('THROTTLER:SKIPdefault', AppController)).toBe(
      true,
    );
  });
});

describe('AppController', () => {
  const mockPlatformService = {
    resolveWebhookBaseUrl: jest.fn().mockResolvedValue('https://example.com'),
    buildWebhookUrl: jest
      .fn()
      .mockResolvedValue('https://example.com/webhooks/incoming'),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'GITLAB_WEBHOOK_AUTO_CONFIGURE') return 'true';
      return defaultValue;
    }),
  };

  const buildModule = (
    prismaMock: { $queryRaw: jest.Mock },
    queueMock?: {
      client: Promise<{ ping: jest.Mock }>;
      getWaitingCount?: jest.Mock;
      getActiveCount?: jest.Mock;
      getFailedCount?: jest.Mock;
    },
  ): Promise<TestingModule> =>
    Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: PlatformService, useValue: mockPlatformService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'DEPLOYMENTS_QUEUE', useValue: queueMock ?? null },
      ],
    }).compile();

  describe('GET /health', () => {
    it('retourne status ok avec database connected', async () => {
      const app = await buildModule({
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      });
      const appController = app.get<AppController>(AppController);

      const result = await appController.getHealth();
      expect(result.status).toBe('ok');
      expect(result.database).toBe('connected');
      expect(result.timestamp).toBeDefined();
    });

    it('retourne database disconnected si Prisma échoue', async () => {
      const app = await buildModule({
        $queryRaw: jest.fn().mockRejectedValue(new Error('DB down')),
      });
      const ctrl = app.get<AppController>(AppController);

      const result = await ctrl.getHealth();
      expect(result.status).toBe('ok');
      expect(result.database).toBe('disconnected');
    });

    it('retourne redis connected quand le ping répond PONG', async () => {
      const app = await buildModule(
        { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) },
        {
          client: Promise.resolve({
            ping: jest.fn().mockResolvedValue('PONG'),
          }),
        },
      );
      const result = await app.get<AppController>(AppController).getHealth();
      expect(result.redis).toBe('connected');
    });

    it('retourne redis disconnected quand la queue est absente', async () => {
      const app = await buildModule({
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      });
      const result = await app.get<AppController>(AppController).getHealth();
      expect(result.redis).toBe('disconnected');
    });

    // Regression test: when Redis is actually down, ioredis' default
    // retryStrategy keeps retrying forever instead of rejecting, so
    // `queue.client` never settles. Before the withTimeout() fix, this made
    // /health hang indefinitely instead of promptly reporting "disconnected".
    it('reports redis disconnected within a bounded time when the queue client never settles', async () => {
      const neverSettles = new Promise<{ ping: jest.Mock }>(() => {
        /* simulates ioredis retrying forever against a dead Redis */
      });
      const app = await buildModule(
        { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) },
        { client: neverSettles },
      );
      const ctrl = app.get<AppController>(AppController);

      const start = Date.now();
      const result = await ctrl.getHealth();
      const elapsedMs = Date.now() - start;

      expect(result.redis).toBe('disconnected');
      // Generous upper bound (the internal timeout is 2s) — this only needs
      // to prove it's bounded, not hanging forever.
      expect(elapsedMs).toBeLessThan(5000);
    }, 10000);

    it('expose le statut webhook configuré quand la base est joignable', async () => {
      const app = await buildModule({
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      });
      const ctrl = app.get<AppController>(AppController);

      const result = await ctrl.getHealth();
      expect(result.webhook.autoConfigure).toBe(true);
      expect(result.webhook.configured).toBe(true);
      expect(result.webhook.valid).toBe(true);
      expect(result.webhook.callbackUrl).toBe(
        'https://example.com/webhooks/incoming',
      );
    });

    it('marque webhook invalide quand resolveWebhookBaseUrl retourne null', async () => {
      mockPlatformService.resolveWebhookBaseUrl.mockResolvedValueOnce(null);
      const app = await buildModule({
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      });
      const ctrl = app.get<AppController>(AppController);

      const result = await ctrl.getHealth();
      expect(result.webhook.configured).toBe(false);
      expect(result.webhook.valid).toBe(false);
      expect(result.webhook.callbackUrl).toBeNull();
    });

    it('désactive autoConfigure quand GITLAB_WEBHOOK_AUTO_CONFIGURE=false', async () => {
      mockConfigService.get.mockImplementationOnce(() => 'false');
      const app = await buildModule({
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      });
      const ctrl = app.get<AppController>(AppController);

      const result = await ctrl.getHealth();
      expect(result.webhook.autoConfigure).toBe(false);
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: string) => {
          if (key === 'GITLAB_WEBHOOK_AUTO_CONFIGURE') return 'true';
          return defaultValue;
        },
      );
    });
  });

  describe('probes', () => {
    it('liveness is dependency-free and always ok', async () => {
      const app = await buildModule({
        $queryRaw: jest.fn().mockRejectedValue(new Error('DB down')),
      });
      const ctrl = app.get<AppController>(AppController);
      expect(ctrl.getLiveness().status).toBe('ok');
    });

    it('readiness returns ready when DB + Redis + queue are up', async () => {
      const app = await buildModule(
        { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) },
        {
          client: Promise.resolve({
            ping: jest.fn().mockResolvedValue('PONG'),
          }),
          // checkQueueStatus() interroge ces compteurs → présents = queue "connected".
          getWaitingCount: jest.fn().mockResolvedValue(0),
          getActiveCount: jest.fn().mockResolvedValue(0),
          getFailedCount: jest.fn().mockResolvedValue(0),
        },
      );
      const ctrl = app.get<AppController>(AppController);
      await expect(ctrl.getReadiness()).resolves.toMatchObject({
        status: 'ready',
      });
    });

    it('readiness throws 503 when a dependency is down', async () => {
      const app = await buildModule({
        $queryRaw: jest.fn().mockRejectedValue(new Error('DB down')),
      });
      const ctrl = app.get<AppController>(AppController);
      await expect(ctrl.getReadiness()).rejects.toMatchObject({ status: 503 });
    });
  });
});
