import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { WebhooksService } from './webhooks.service';
import { SourceProvidersService } from '../source-providers/source-providers.service';
import { PlatformService } from '../platform/platform.service';
import { WebhookManagementService } from './webhook-management.service';

describe('WebhookManagementService — status & toggle', () => {
  let prisma: {
    webhookEndpoint: { findFirst: jest.Mock; update: jest.Mock };
    service: { findFirst: jest.Mock };
  };
  let platform: { buildWebhookUrl: jest.Mock };
  let service: WebhookManagementService;

  beforeEach(() => {
    prisma = {
      webhookEndpoint: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      service: {
        findFirst: jest.fn().mockResolvedValue({ id: 'svc1' }),
      },
    };
    platform = {
      buildWebhookUrl: jest
        .fn()
        .mockResolvedValue('https://api/webhooks/incoming/tok'),
    };
    service = new WebhookManagementService(
      prisma as unknown as PrismaService,
      {} as unknown as WebhooksService,
      {} as unknown as SourceProvidersService,
      platform as unknown as PlatformService,
    );
  });

  it('reports not-configured when no endpoint exists for a service', async () => {
    prisma.webhookEndpoint.findFirst.mockResolvedValue(null);
    await expect(service.getStatusForService('p1', 'svc1')).resolves.toEqual({
      configured: false,
    });
  });

  it('reports configured status with a built webhook URL', async () => {
    prisma.webhookEndpoint.findFirst.mockResolvedValue({
      id: 'e1',
      isActive: true,
      webhookToken: 'tok',
      provider: 'GITLAB',
      lastEventAt: null,
    });
    const res = await service.getStatusForService('p1', 'svc1');
    expect(res).toMatchObject({
      configured: true,
      isActive: true,
      provider: 'GITLAB',
      webhookUrl: 'https://api/webhooks/incoming/tok',
    });
    expect(platform.buildWebhookUrl).toHaveBeenCalledWith(
      'webhooks/incoming/tok',
    );
  });

  it('404s setActiveForService when no endpoint exists', async () => {
    prisma.webhookEndpoint.findFirst.mockResolvedValue(null);
    await expect(
      service.setActiveForService('p1', 'svc1', false),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('toggles the active flag for a service endpoint', async () => {
    prisma.webhookEndpoint.findFirst.mockResolvedValue({ id: 'e1' });
    await service.setActiveForService('p1', 'svc1', false);
    expect(prisma.webhookEndpoint.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { isActive: false },
    });
  });

  it('404s before reading a webhook when the service is outside the project', async () => {
    prisma.service.findFirst.mockResolvedValue(null);

    await expect(
      service.getStatusForService('p1', 'foreign-service'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.webhookEndpoint.findFirst).not.toHaveBeenCalled();
  });

  it('scopes endpoint reads and writes by project and service', async () => {
    prisma.webhookEndpoint.findFirst.mockResolvedValue({ id: 'e1' });

    await service.setActiveForService('p1', 'svc1', true);

    expect(prisma.service.findFirst).toHaveBeenCalledWith({
      where: { id: 'svc1', projectId: 'p1' },
      select: { id: true },
    });
    expect(prisma.webhookEndpoint.findFirst).toHaveBeenCalledWith({
      where: { projectId: 'p1', serviceId: 'svc1' },
    });
  });
});

describe('WebhookManagementService — configureForService regression test', () => {
  let prisma: {
    webhookEndpoint: { findFirst: jest.Mock };
    service: { findFirst: jest.Mock };
  };
  let webhooks: { getOrCreateEndpoint: jest.Mock };
  let sourceProviders: { forService: jest.Mock };
  let platform: { buildWebhookUrl: jest.Mock };
  let provider: { configureWebhook: jest.Mock };
  let service: WebhookManagementService;

  beforeEach(() => {
    prisma = {
      webhookEndpoint: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      service: {
        findFirst: jest.fn().mockResolvedValue({ id: 'svc1' }),
      },
    };
    webhooks = {
      getOrCreateEndpoint: jest.fn().mockResolvedValue({
        id: 'e1',
        webhookToken: 'tok',
        secret: 's3cr3t',
      }),
    };
    sourceProviders = {
      forService: jest.fn().mockResolvedValue({ type: 'GITLAB' }),
    };
    platform = {
      buildWebhookUrl: jest
        .fn()
        .mockResolvedValue('https://api/webhooks/incoming/tok'),
    };
    provider = {
      configureWebhook: jest.fn().mockResolvedValue(undefined),
    };
    sourceProviders.forService.mockReturnValue(provider);

    service = new WebhookManagementService(
      prisma as unknown as PrismaService,
      webhooks as unknown as WebhooksService,
      sourceProviders as unknown as SourceProvidersService,
      platform as unknown as PlatformService,
    );
  });

  it('passes serviceId to provider.configureWebhook (regression test)', async () => {
    await service.configureForService('proj1', 'svc1');

    expect(provider.configureWebhook).toHaveBeenCalledWith(
      'proj1',
      'https://api/webhooks/incoming/tok',
      's3cr3t', // ← le secret partagé (pas le webhookToken)
      'svc1',
    );
  });

  it('does not resolve a provider for a service outside the project', async () => {
    prisma.service.findFirst.mockResolvedValue(null);

    await expect(
      service.configureForService('proj1', 'foreign-service'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sourceProviders.forService).not.toHaveBeenCalled();
  });
});
