import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  BuildPack,
  BuildStatus,
  BuildTrigger,
} from '@prisma/client';
import { BuildLifecycleService } from './build-lifecycle.service';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * P2-#1 — Build table centralization. These tests pin the contract of
 * the lifecycle helpers: status transitions and imageSha pinning.
 */
describe('BuildLifecycleService', () => {
  let service: BuildLifecycleService;
  let prisma: {
    build: {
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      build: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BuildLifecycleService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(BuildLifecycleService);
  });

  describe('create', () => {
    it('persists a Build row with the correct fields', async () => {
      prisma.build.create.mockResolvedValue({ id: 'build_1' });

      await service.create({
        projectId: 'proj_1',
        serviceId: 'svc_1',
        userId: 'user_1',
        branch: 'main',
        buildPack: BuildPack.NIXPACKS,
        isLocalBuild: true,
        nixpacksConfig: { providers: ['node'] },
        staticConfig: null,
        externalPipelineId: BigInt(42),
        commitSha: 'abc1234',
        triggeredBy: BuildTrigger.WEBHOOK,
      });

      expect(prisma.build.create).toHaveBeenCalledTimes(1);
      const call = prisma.build.create.mock.calls[0][0];
      expect(call.data).toMatchObject({
        projectId: 'proj_1',
        serviceId: 'svc_1',
        userId: 'user_1',
        branch: 'main',
        buildPack: BuildPack.NIXPACKS,
        isLocalBuild: true,
        status: BuildStatus.NOT_BUILT,
        triggeredBy: BuildTrigger.WEBHOOK,
        externalPipelineId: BigInt(42),
        commitSha: 'abc1234',
      });
      expect(call.data.nixpacksConfig).toEqual({ providers: ['node'] });
    });

    it('defaults triggeredBy to MANUAL when not provided', async () => {
      prisma.build.create.mockResolvedValue({ id: 'build_1' });

      await service.create({
        projectId: 'proj_1',
        userId: 'user_1',
        branch: 'main',
        buildPack: BuildPack.DOCKERFILE,
      });

      expect(prisma.build.create.mock.calls[0][0].data.triggeredBy).toBe(
        BuildTrigger.MANUAL,
      );
    });
  });

  describe('lifecycle transitions', () => {
    it('markStarted sets status=BUILDING and startedAt', async () => {
      prisma.build.update.mockResolvedValue({ id: 'b1' });
      await service.markStarted('b1', BigInt(99));
      expect(prisma.build.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: {
          status: BuildStatus.BUILDING,
          startedAt: expect.any(Date),
          externalPipelineId: BigInt(99),
        },
      });
    });

    it('markSucceeded pins imageSha when provided (rollback safety)', async () => {
      prisma.build.update.mockResolvedValue({ id: 'b1' });
      await service.markSucceeded('b1', 'sha256:deadbeef');
      expect(prisma.build.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: {
          status: BuildStatus.SUCCESS,
          finishedAt: expect.any(Date),
          imageSha: 'sha256:deadbeef',
        },
      });
    });

    it('markSucceeded omits imageSha when null (so DB stays null, not cleared)', async () => {
      prisma.build.update.mockResolvedValue({ id: 'b1' });
      await service.markSucceeded('b1', null);
      const data = prisma.build.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('imageSha');
    });

    it('markFailed truncates errorMessage to 50k chars', async () => {
      prisma.build.update.mockResolvedValue({ id: 'b1' });
      const huge = 'x'.repeat(100_000);
      await service.markFailed('b1', huge);
      const data = prisma.build.update.mock.calls[0][0].data;
      expect(data.errorMessage).toHaveLength(50_000);
      expect(data.status).toBe(BuildStatus.FAILED);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when build is missing', async () => {
      prisma.build.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
