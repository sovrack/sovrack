import { NotFoundException } from '@nestjs/common';
import { WebhookEventStatus } from '@prisma/client';
import { WebhookAuditController } from './webhook-audit.controller';

function makeServices(
  opts: { endpoints?: { id: string }[]; event?: unknown } = {},
) {
  const endpoints = opts.endpoints ?? [{ id: 'ep1' }, { id: 'ep2' }];
  const webhooksService = {
    listEndpointsForProject: jest.fn().mockResolvedValue(endpoints),
    listEventsForProject: jest.fn().mockResolvedValue([]),
    findEvent: jest.fn().mockResolvedValue(opts.event ?? { id: 'evt1' }),
    setEnabled: jest.fn().mockResolvedValue({ id: 'ep1', enabled: true }),
  };
  const retryService = {
    replayEvent: jest.fn().mockResolvedValue({ id: 'evt1', status: 'PENDING' }),
  };
  return { webhooksService, retryService };
}

describe('WebhookAuditController', () => {
  describe('listEndpoints', () => {
    it('returns endpoints for the project', async () => {
      const { webhooksService, retryService } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
      );
      const result = await ctrl.listEndpoints('proj1');
      expect(webhooksService.listEndpointsForProject).toHaveBeenCalledWith(
        'proj1',
      );
      expect(result).toEqual([{ id: 'ep1' }, { id: 'ep2' }]);
    });
  });

  describe('listEvents', () => {
    it('uses default limit 100 when not provided', async () => {
      const { webhooksService, retryService } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
      );
      await ctrl.listEvents('proj1');
      expect(webhooksService.listEventsForProject).toHaveBeenCalledWith(
        'proj1',
        { limit: 100 },
      );
    });

    it('parses numeric limit from query string', async () => {
      const { webhooksService, retryService } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
      );
      await ctrl.listEvents('proj1', undefined, '50');
      expect(webhooksService.listEventsForProject).toHaveBeenCalledWith(
        'proj1',
        { limit: 50 },
      );
    });

    it('clamps limit to 500', async () => {
      const { webhooksService, retryService } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
      );
      await ctrl.listEvents('proj1', undefined, '9999');
      expect(webhooksService.listEventsForProject).toHaveBeenCalledWith(
        'proj1',
        { limit: 500 },
      );
    });

    it('passes status filter when provided', async () => {
      const { webhooksService, retryService } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
      );
      await ctrl.listEvents('proj1', WebhookEventStatus.FAILED);
      expect(webhooksService.listEventsForProject).toHaveBeenCalledWith(
        'proj1',
        expect.objectContaining({ status: WebhookEventStatus.FAILED }),
      );
    });
  });

  describe('getEvent', () => {
    it('returns event by id', async () => {
      const { webhooksService, retryService } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
      );
      const result = await ctrl.getEvent('evt1');
      expect(webhooksService.findEvent).toHaveBeenCalledWith('evt1');
      expect(result).toEqual({ id: 'evt1' });
    });
  });

  describe('replayEvent', () => {
    it('delegates to retryService.replayEvent', async () => {
      const { webhooksService, retryService } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
      );
      const result = await ctrl.replayEvent('evt1');
      expect(retryService.replayEvent).toHaveBeenCalledWith('evt1');
      expect(result).toEqual({ id: 'evt1', status: 'PENDING' });
    });
  });

  describe('setEnabled', () => {
    it('enables an endpoint that belongs to the project', async () => {
      const { webhooksService, retryService } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
      );
      await ctrl.setEnabled('proj1', 'ep1', { enabled: true });
      expect(webhooksService.setEnabled).toHaveBeenCalledWith('ep1', true);
    });

    it('throws NotFoundException when endpoint does not belong to project', async () => {
      const { webhooksService, retryService } = makeServices({
        endpoints: [{ id: 'ep1' }],
      });
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
      );
      await expect(
        ctrl.setEnabled('proj1', 'ep-other', { enabled: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
