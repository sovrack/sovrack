import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GitProviderType, WebhookEventStatus } from '@prisma/client';
import {
  WebhookEventsService,
  WEBHOOK_MAX_ATTEMPTS,
} from './webhook-events.service';
import { PrismaService } from '../../shared/database/prisma.service';

describe('WebhookEventsService', () => {
  let service: WebhookEventsService;
  let prisma: {
    webhookEvent: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    webhookEndpoint: {
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      webhookEvent: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      webhookEndpoint: {
        update: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhookEventsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(WebhookEventsService);
  });

  describe('record', () => {
    it('creates a new event and updates lastEventAt', async () => {
      prisma.webhookEvent.create.mockResolvedValue({ id: 'evt_1' });
      prisma.webhookEndpoint.update.mockResolvedValue({});

      const result = await service.record({
        endpointId: 'ep_1',
        provider: GitProviderType.GITLAB,
        eventType: 'push',
        payload: { ref: 'main' },
        headers: { 'x-gitlab-event': 'Push Hook' },
      });

      expect(result).toEqual({ id: 'evt_1', deduplicated: false });
      expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
        data: {
          endpointId: 'ep_1',
          provider: GitProviderType.GITLAB,
          eventType: 'push',
          externalDeliveryId: null,
          payload: { ref: 'main' },
          headers: { 'x-gitlab-event': 'Push Hook' },
          status: WebhookEventStatus.RECEIVED,
        },
        select: { id: true },
      });
      expect(prisma.webhookEndpoint.update).toHaveBeenCalledWith({
        where: { id: 'ep_1' },
        data: { lastEventAt: expect.any(Date) },
      });
    });

    it('deduplicates when externalDeliveryId matches an existing event', async () => {
      prisma.webhookEvent.findFirst.mockResolvedValue({ id: 'evt_existing' });

      const result = await service.record({
        endpointId: 'ep_1',
        provider: GitProviderType.GITLAB,
        eventType: 'push',
        externalDeliveryId: 'del_123',
        payload: { ref: 'main' },
        headers: {},
      });

      expect(result).toEqual({ id: 'evt_existing', deduplicated: true });
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
      expect(prisma.webhookEndpoint.update).not.toHaveBeenCalled();
    });

    it('skips dedup lookup when externalDeliveryId is null', async () => {
      prisma.webhookEvent.create.mockResolvedValue({ id: 'evt_2' });
      prisma.webhookEndpoint.update.mockResolvedValue({});

      await service.record({
        endpointId: 'ep_1',
        provider: GitProviderType.GITLAB,
        eventType: 'push',
        payload: { ref: 'main' },
        headers: {},
      });

      expect(prisma.webhookEvent.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('markProcessed', () => {
    it('marks the event as PROCESSED with incremented attempt', async () => {
      prisma.webhookEvent.update.mockResolvedValue({
        id: 'evt_1',
        status: WebhookEventStatus.PROCESSED,
      });

      const result = await service.markProcessed('evt_1');

      expect(result.status).toBe(WebhookEventStatus.PROCESSED);
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt_1' },
        data: {
          status: WebhookEventStatus.PROCESSED,
          processedAt: expect.any(Date),
          lastAttemptAt: expect.any(Date),
          attempts: { increment: 1 },
        },
      });
    });

    it('persists normalizedEvent when provided', async () => {
      const normalized = { action: 'merged', target: 'main' };
      prisma.webhookEvent.update.mockResolvedValue({});

      await service.markProcessed('evt_1', normalized);

      expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ normalizedEvent: normalized }),
        }),
      );
    });
  });

  describe('markFailed', () => {
    it('increments attempts and sets FAILED status with backoff', async () => {
      prisma.webhookEvent.findUnique.mockResolvedValue({ attempts: 0 });
      prisma.webhookEvent.update.mockResolvedValue({});

      await service.markFailed('evt_1', 'timeout');

      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt_1' },
        data: {
          status: WebhookEventStatus.FAILED,
          lastAttemptAt: expect.any(Date),
          attempts: { increment: 1 },
          errorMessage: 'timeout',
          nextRetryAt: expect.any(Date),
        },
      });
    });

    it('dead-letters when attempt count reaches max', async () => {
      prisma.webhookEvent.findUnique.mockResolvedValue({
        attempts: WEBHOOK_MAX_ATTEMPTS - 1,
      });
      prisma.webhookEvent.update.mockResolvedValue({});

      await service.markFailed('evt_1', 'final failure');

      expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: WebhookEventStatus.DEAD_LETTER,
            nextRetryAt: null,
          }),
        }),
      );
    });

    it('dead-letters immediately when deadLetter option is true', async () => {
      prisma.webhookEvent.findUnique.mockResolvedValue({ attempts: 0 });
      prisma.webhookEvent.update.mockResolvedValue({});

      await service.markFailed('evt_1', 'manual dead-letter', {
        deadLetter: true,
      });

      expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: WebhookEventStatus.DEAD_LETTER,
            nextRetryAt: null,
          }),
        }),
      );
    });

    it('falls back to default backoff for attempts beyond the table', async () => {
      prisma.webhookEvent.findUnique.mockResolvedValue({
        attempts: WEBHOOK_MAX_ATTEMPTS,
      });
      prisma.webhookEvent.update.mockResolvedValue({});

      await service.markFailed('evt_1', 'beyond max');

      // WEBHOOK_MAX_ATTEMPTS = 5, so next would be 6 → dead-letter
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: WebhookEventStatus.DEAD_LETTER,
            nextRetryAt: null,
          }),
        }),
      );
    });
  });

  describe('markDeadLetter', () => {
    it('sets DEAD_LETTER status and clears nextRetryAt', async () => {
      prisma.webhookEvent.update.mockResolvedValue({});

      await service.markDeadLetter('evt_1');

      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt_1' },
        data: { status: WebhookEventStatus.DEAD_LETTER, nextRetryAt: null },
      });
    });
  });

  describe('listDueRetries', () => {
    it('returns FAILED events past their retry time', async () => {
      const row = {
        id: 'evt_1',
        provider: GitProviderType.GITLAB,
        attempts: 2,
        payload: { ref: 'main' },
        endpoint: {
          id: 'ep_1',
          projectId: 'proj_1',
          serviceEnvId: null,
          serviceId: null,
          provider: GitProviderType.GITLAB,
          isActive: true,
        },
      };
      prisma.webhookEvent.findMany.mockResolvedValue([row]);

      const result = await service.listDueRetries(10);

      expect(result).toEqual([
        {
          id: 'evt_1',
          provider: GitProviderType.GITLAB,
          attempts: 2,
          payload: { ref: 'main' },
          endpoint: {
            id: 'ep_1',
            projectId: 'proj_1',
            serviceEnvId: null,
            serviceId: null,
            provider: GitProviderType.GITLAB,
            isActive: true,
          },
        },
      ]);
      expect(prisma.webhookEvent.findMany).toHaveBeenCalledWith({
        where: {
          status: WebhookEventStatus.FAILED,
          nextRetryAt: { lte: expect.any(Date) },
          attempts: { lt: WEBHOOK_MAX_ATTEMPTS },
        },
        orderBy: { nextRetryAt: 'asc' },
        take: 10,
        select: expect.any(Object),
      });
    });

    it('returns empty array when none are due', async () => {
      prisma.webhookEvent.findMany.mockResolvedValue([]);

      const result = await service.listDueRetries();

      expect(result).toEqual([]);
    });
  });

  describe('claimForRetry', () => {
    it('returns true when updateMany affects one row', async () => {
      prisma.webhookEvent.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.claimForRetry('evt_1');

      expect(result).toBe(true);
      expect(prisma.webhookEvent.updateMany).toHaveBeenCalledWith({
        where: { id: 'evt_1', status: WebhookEventStatus.FAILED },
        data: {
          status: WebhookEventStatus.RECEIVED,
          lastAttemptAt: expect.any(Date),
        },
      });
    });

    it('returns false when the event was already claimed', async () => {
      prisma.webhookEvent.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.claimForRetry('evt_1');

      expect(result).toBe(false);
    });
  });

  describe('findEventForRetry', () => {
    it('returns the event with its endpoint context', async () => {
      const row = {
        id: 'evt_1',
        provider: GitProviderType.GITLAB,
        attempts: 1,
        payload: { ref: 'main' },
        endpoint: {
          id: 'ep_1',
          projectId: 'proj_1',
          serviceEnvId: null,
          serviceId: null,
          provider: GitProviderType.GITLAB,
          isActive: true,
        },
      };
      prisma.webhookEvent.findUnique.mockResolvedValue(row);

      const result = await service.findEventForRetry('evt_1');

      expect(result).toEqual({
        id: 'evt_1',
        provider: GitProviderType.GITLAB,
        attempts: 1,
        payload: { ref: 'main' },
        endpoint: {
          id: 'ep_1',
          projectId: 'proj_1',
          serviceEnvId: null,
          serviceId: null,
          provider: GitProviderType.GITLAB,
          isActive: true,
        },
      });
    });

    it('throws NotFoundException when event does not exist', async () => {
      prisma.webhookEvent.findUnique.mockResolvedValue(null);

      await expect(service.findEventForRetry('evt_missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('resetForReplay', () => {
    it('resets status, attempts, nextRetryAt and errorMessage', async () => {
      prisma.webhookEvent.update.mockResolvedValue({});

      await service.resetForReplay('evt_1');

      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt_1' },
        data: {
          status: WebhookEventStatus.RECEIVED,
          attempts: 0,
          nextRetryAt: null,
          errorMessage: null,
        },
      });
    });
  });

  describe('listEventsForEndpoint', () => {
    it('queries by endpointId with default limit', async () => {
      prisma.webhookEvent.findMany.mockResolvedValue([]);

      await service.listEventsForEndpoint('ep_1');

      expect(prisma.webhookEvent.findMany).toHaveBeenCalledWith({
        where: { endpointId: 'ep_1' },
        orderBy: { receivedAt: 'desc' },
        take: 50,
      });
    });

    it('filters by status when provided', async () => {
      prisma.webhookEvent.findMany.mockResolvedValue([]);

      await service.listEventsForEndpoint('ep_1', {
        status: WebhookEventStatus.FAILED,
        limit: 10,
      });

      expect(prisma.webhookEvent.findMany).toHaveBeenCalledWith({
        where: { endpointId: 'ep_1', status: WebhookEventStatus.FAILED },
        orderBy: { receivedAt: 'desc' },
        take: 10,
      });
    });
  });

  describe('listEventsForProject', () => {
    it('queries by projectId through endpoint relation', async () => {
      prisma.webhookEvent.findMany.mockResolvedValue([]);

      await service.listEventsForProject('proj_1');

      expect(prisma.webhookEvent.findMany).toHaveBeenCalledWith({
        where: { endpoint: { projectId: 'proj_1' } },
        orderBy: { receivedAt: 'desc' },
        take: 100,
        include: {
          endpoint: {
            select: { id: true, webhookToken: true, provider: true },
          },
        },
      });
    });
  });

  describe('findEvent', () => {
    it('returns the event when found', async () => {
      const row = { id: 'evt_1', status: WebhookEventStatus.RECEIVED };
      prisma.webhookEvent.findUnique.mockResolvedValue(row);

      const result = await service.findEvent('evt_1');

      expect(result).toEqual(row);
    });

    it('throws NotFoundException when the event is missing', async () => {
      prisma.webhookEvent.findUnique.mockResolvedValue(null);

      await expect(service.findEvent('evt_missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
