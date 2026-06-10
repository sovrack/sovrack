import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaService } from './core/database/prisma.service';
import { PlatformService } from './modules/platform/platform.service';

describe('AppController', () => {
  const mockPlatformService = {
    resolveWebhookBaseUrl: jest.fn().mockResolvedValue('https://example.com'),
    buildWebhookUrl: jest
      .fn()
      .mockResolvedValue('https://example.com/gitlab/webhook'),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'GITLAB_WEBHOOK_AUTO_CONFIGURE') return 'true';
      return defaultValue;
    }),
  };

  const buildModule = (prismaMock: {
    $queryRaw: jest.Mock;
  }): Promise<TestingModule> =>
    Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: PlatformService, useValue: mockPlatformService },
        { provide: ConfigService, useValue: mockConfigService },
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
        'https://example.com/gitlab/webhook',
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
});
