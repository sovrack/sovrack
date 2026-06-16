import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GitProviderType, WebhookEventStatus } from '@prisma/client';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * P4 — Webhook observability. The service is the audit log: it records
 * every incoming webhook, dedupes provider retries, exposes lifecycle
 * helpers (markProcessed / markFailed), and queries for the admin UI.
 */
describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: {
    webhookEndpoint: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    webhookEvent: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      webhookEndpoint: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      webhookEvent: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(WebhooksService);
  });

  describe('getOrCreateEndpoint', () => {
    it('returns the existing endpoint without exposing its secret', async () => {
      prisma.webhookEndpoint.findFirst.mockResolvedValue({
        id: 'ep_1',
        webhookToken: 'tok-123',
      });
      const result = await service.getOrCreateEndpoint({
        projectId: 'proj_1',
        provider: GitProviderType.GITLAB,
        events: ['push'],
      });
      expect(result).toEqual({ id: 'ep_1', webhookToken: 'tok-123', secret: '' });
      expect(prisma.webhookEndpoint.create).not.toHaveBeenCalled();
    });

    it('creates a new endpoint with a 32-byte secret when none exists', async () => {
      prisma.webhookEndpoint.findFirst.mockResolvedValue(null);
      prisma.webhookEndpoint.create.mockResolvedValue({
        id: 'ep_new',
        webhookToken: 'tok-new',
      });
      const result = await service.getOrCreateEndpoint({
        projectId: 'proj_2',
        serviceEnvId: 'svc_1',
        provider: GitProviderType.GITHUB,
        events: ['push', 'pull_request'],
      });
      expect(result.id).toBe('ep_new');
      expect(result.webhookToken).toBe('tok-new');
      expect(result.secret).toMatch(/^[0-9a-f]{64}$/); // 32 bytes = 64 hex chars
      const createCall = prisma.webhookEndpoint.create.mock.calls[0][0];
      expect(createCall.data).toMatchObject({
        projectId: 'proj_2',
        serviceEnvId: 'svc_1',
        provider: 'GITHUB',
        events: ['push', 'pull_request'],
      });
    });
  });

  describe('buildPublicUrl', () => {
    it('strips trailing slashes from the base URL', () => {
      expect(service.buildPublicUrl('https://platform.example.com/', 'tok')).toBe(
        'https://platform.example.com/webhooks/incoming/tok',
      );
    });
    it('appends /webhooks/incoming/<token> to the base URL (P4-#2 unified endpoint)', () => {
      expect(service.buildPublicUrl('https://p.example.com', 'abc')).toBe(
        'https://p.example.com/webhooks/incoming/abc',
      );
    });
  });

  describe('record (audit log + dedup)', () => {
    it('deduplicates by externalDeliveryId when the same delivery is replayed', async () => {
      prisma.webhookEvent.findFirst.mockResolvedValue({ id: 'evt_existing' });
      const result = await service.record({
        endpointId: 'ep_1',
        provider: GitProviderType.GITLAB,
        eventType: 'pipeline',
        externalDeliveryId: 'gl-uuid-1',
        payload: { foo: 'bar' },
        headers: { 'x-gitlab-event': 'pipeline' },
      });
      expect(result).toEqual({ id: 'evt_existing', deduplicated: true });
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    });

    it('creates a new event row when deliveryId is new', async () => {
      prisma.webhookEvent.findFirst.mockResolvedValue(null);
      prisma.webhookEvent.create.mockResolvedValue({ id: 'evt_new' });
      prisma.webhookEndpoint.update.mockResolvedValue({});
      const result = await service.record({
        endpointId: 'ep_1',
        provider: GitProviderType.GITLAB,
        eventType: 'pipeline',
        externalDeliveryId: 'gl-uuid-2',
        payload: { foo: 'bar' },
        headers: { 'x-gitlab-event': 'pipeline' },
      });
      expect(result).toEqual({ id: 'evt_new', deduplicated: false });
      expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          endpointId: 'ep_1',
          eventType: 'pipeline',
          status: WebhookEventStatus.RECEIVED,
          externalDeliveryId: 'gl-uuid-2',
        }),
        select: { id: true },
      });
      // Bumps the endpoint's lastEventAt — used by the admin UI to detect
      // "configured but no events for 30 days".
      expect(prisma.webhookEndpoint.update).toHaveBeenCalledWith({
        where: { id: 'ep_1' },
        data: { lastEventAt: expect.any(Date) },
      });
    });

    it('skips the dedupe lookup when externalDeliveryId is null', async () => {
      prisma.webhookEvent.create.mockResolvedValue({ id: 'evt_new' });
      prisma.webhookEndpoint.update.mockResolvedValue({});
      await service.record({
        endpointId: 'ep_1',
        provider: GitProviderType.GITLAB,
        eventType: 'push',
        externalDeliveryId: null,
        payload: {},
        headers: {},
      });
      expect(prisma.webhookEvent.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle transitions', () => {
    it('markProcessed sets status=PROCESSED and bumps attempts', async () => {
      prisma.webhookEvent.update.mockResolvedValue({});
      await service.markProcessed('evt_1');
      const data = prisma.webhookEvent.update.mock.calls[0][0].data;
      expect(data.status).toBe(WebhookEventStatus.PROCESSED);
      expect(data.processedAt).toBeInstanceOf(Date);
      expect(data.attempts).toEqual({ increment: 1 });
    });

    it('markFailed truncates errorMessage to 50k chars', async () => {
      prisma.webhookEvent.update.mockResolvedValue({});
      const huge = 'x'.repeat(100_000);
      await service.markFailed('evt_1', huge);
      const data = prisma.webhookEvent.update.mock.calls[0][0].data;
      expect(data.errorMessage).toHaveLength(50_000);
      expect(data.status).toBe(WebhookEventStatus.FAILED);
    });

    it('markFailed with deadLetter=true sets status=DEAD_LETTER', async () => {
      prisma.webhookEvent.update.mockResolvedValue({});
      await service.markFailed('evt_1', 'retries exhausted', { deadLetter: true });
      expect(prisma.webhookEvent.update.mock.calls[0][0].data.status).toBe(
        WebhookEventStatus.DEAD_LETTER,
      );
    });

    it('markFailed with nextRetryAt sets the retry schedule', async () => {
      prisma.webhookEvent.update.mockResolvedValue({});
      const retryAt = new Date('2026-06-05T10:00:00Z');
      await service.markFailed('evt_1', 'transient', { nextRetryAt: retryAt });
      expect(prisma.webhookEvent.update.mock.calls[0][0].data.nextRetryAt).toBe(
        retryAt,
      );
    });
  });

  describe('findEvent', () => {
    it('throws NotFoundException when event is missing', async () => {
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      await expect(service.findEvent('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('P4 #2 — unified endpoint lookup', () => {
    it('findByToken returns the endpoint context (id, projectId, serviceEnvId, provider, isActive)', async () => {
      prisma.webhookEndpoint.findUnique.mockResolvedValue({
        id: 'ep_1',
        projectId: 'proj_1',
        serviceEnvId: null,
        serviceId: null,
        provider: GitProviderType.GITLAB,
        isActive: true,
      });
      const result = await service.findByToken('tok-123');
      expect(result).toEqual({
        id: 'ep_1',
        projectId: 'proj_1',
        serviceEnvId: null,
        serviceId: null,
        provider: GitProviderType.GITLAB,
        isActive: true,
      });
      // O(1) via the unique index on webhookToken.
      expect(prisma.webhookEndpoint.findUnique).toHaveBeenCalledWith({
        where: { webhookToken: 'tok-123' },
        select: { id: true, projectId: true, serviceEnvId: true, serviceId: true, provider: true, isActive: true },
      });
    });

    it('findByToken returns null when the token is unknown', async () => {
      prisma.webhookEndpoint.findUnique.mockResolvedValue(null);
      const result = await service.findByToken('nope');
      expect(result).toBeNull();
    });

    it('setEnabled toggles isActive on the endpoint', async () => {
      prisma.webhookEndpoint.update.mockResolvedValue({
        id: 'ep_1',
        isActive: false,
      });
      const result = await service.setEnabled('ep_1', false);
      expect(result).toEqual({ id: 'ep_1', isActive: false });
      expect(prisma.webhookEndpoint.update).toHaveBeenCalledWith({
        where: { id: 'ep_1' },
        data: { isActive: false },
        select: { id: true, isActive: true },
      });
    });
  });
});
