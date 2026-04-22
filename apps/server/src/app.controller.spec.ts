import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('GET /health', () => {
    it('retourne status ok avec database connected', async () => {
      const result = await appController.getHealth();
      expect(result.status).toBe('ok');
      expect(result.database).toBe('connected');
      expect(result.timestamp).toBeDefined();
    });

    it('retourne database disconnected si Prisma échoue', async () => {
      const app: TestingModule = await Test.createTestingModule({
        controllers: [AppController],
        providers: [
          {
            provide: PrismaService,
            useValue: {
              $queryRaw: jest.fn().mockRejectedValue(new Error('DB down')),
            },
          },
        ],
      }).compile();

      const ctrl = app.get<AppController>(AppController);
      const result = await ctrl.getHealth();
      expect(result.status).toBe('ok');
      expect(result.database).toBe('disconnected');
    });
  });
});
