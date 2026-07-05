import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { WebhooksService } from './webhooks.service';
import { SourceProvidersService } from '../source-providers/source-providers.service';
import { PlatformService } from '../platform/platform.service';
import { WebhookManagementService } from './webhook-management.service';

describe('WebhookManagementService — status & toggle', () => {
  let prisma: {
    webhookEndpoint: { findFirst: jest.Mock; update: jest.Mock };
    project: { findUnique: jest.Mock };
    service: { findMany: jest.Mock };
  };
  let platform: { buildWebhookUrl: jest.Mock };
  let service: WebhookManagementService;

  beforeEach(() => {
    prisma = {
      webhookEndpoint: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      project: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p1', name: 'proj' }),
      },
      service: {
        findMany: jest.fn().mockResolvedValue([]),
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
    await expect(service.getStatusForService('svc1')).resolves.toEqual({
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
    const res = await service.getStatusForService('svc1');
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
      service.setActiveForService('svc1', false),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('toggles the active flag for a service endpoint', async () => {
    prisma.webhookEndpoint.findFirst.mockResolvedValue({ id: 'e1' });
    await service.setActiveForService('svc1', false);
    expect(prisma.webhookEndpoint.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { isActive: false },
    });
  });

  it('404s setActive for a project with no endpoint', async () => {
    prisma.webhookEndpoint.findFirst.mockResolvedValue(null);
    await expect(service.setActive('p1', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// Moved from BuildSetupService.reconcileWebhooks (see A10 in the
// Sprints 4+5+6 mission) — legacy per-service redirect notice.
describe('WebhookManagementService.reconcileWebhooksNotice', () => {
  function harness(
    opts: {
      project?: { id: string; name: string } | null;
      services?: { id: string; name: string }[];
    } = {},
  ) {
    const prisma = {
      project: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            opts.project === undefined
              ? { id: 'p1', name: 'proj' }
              : opts.project,
          ),
      },
      service: {
        findMany: jest.fn().mockResolvedValue(opts.services ?? []),
      },
    };
    const service = new WebhookManagementService(
      prisma as unknown as PrismaService,
      {} as unknown as WebhooksService,
      {} as unknown as SourceProvidersService,
      {} as unknown as PlatformService,
    );
    return { service, prisma };
  }

  it('404s when the project does not exist', async () => {
    const { service } = harness({ project: null });
    await expect(
      service.reconcileWebhooksNotice('nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns one redirect notice per active service', async () => {
    const { service } = harness({
      services: [
        { id: 's1', name: 'api' },
        { id: 's2', name: 'worker' },
      ],
    });
    const { results } = await service.reconcileWebhooksNotice('p1');
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      serviceId: 's1',
      serviceName: 'api',
      status: 'SUCCESS',
      dockerfileStatus: 'SKIPPED',
    });
    expect(results[0].message).toContain('/webhook/configure');
  });

  it('falls back to a single project-level entry when there are no services', async () => {
    const { service } = harness({ services: [] });
    const { results } = await service.reconcileWebhooksNotice('p1');
    expect(results).toEqual([
      expect.objectContaining({ serviceId: 'p1', serviceName: 'proj' }),
    ]);
  });
});
