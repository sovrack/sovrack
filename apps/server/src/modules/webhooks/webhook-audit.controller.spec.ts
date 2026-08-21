import { NotFoundException } from '@nestjs/common';
import { Role, WebhookEventStatus } from '@prisma/client';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { WebhookAuditController } from './webhook-audit.controller';

const user = { id: 'user-1', role: Role.MEMBER } as JwtPayload;

function makeServices(
  opts: { endpoints?: { id: string }[]; event?: unknown } = {},
) {
  const endpoints = opts.endpoints ?? [{ id: 'ep1' }, { id: 'ep2' }];
  const webhooksService = {
    listEndpointsForProject: jest.fn().mockResolvedValue(endpoints),
    listEventsForProject: jest.fn().mockResolvedValue([]),
    findEventForProject: jest
      .fn()
      .mockResolvedValue(opts.event ?? { id: 'evt1' }),
    setEnabled: jest.fn().mockResolvedValue({ id: 'ep1', enabled: true }),
  };
  const retryService = {
    replayEvent: jest.fn().mockResolvedValue({ id: 'evt1', status: 'PENDING' }),
  };
  const workspaceAccess = {
    assertProjectAction: jest.fn().mockResolvedValue({}),
  };
  return { webhooksService, retryService, workspaceAccess };
}

describe('WebhookAuditController', () => {
  describe('listEndpoints', () => {
    it('returns endpoints for the project', async () => {
      const { webhooksService, retryService, workspaceAccess } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
        workspaceAccess as never,
      );
      const result = await ctrl.listEndpoints('proj1', user);
      expect(webhooksService.listEndpointsForProject).toHaveBeenCalledWith(
        'proj1',
      );
      expect(result).toEqual([{ id: 'ep1' }, { id: 'ep2' }]);
    });
  });

  describe('listEvents', () => {
    it('uses default limit 100 when not provided', async () => {
      const { webhooksService, retryService, workspaceAccess } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
        workspaceAccess as never,
      );
      await ctrl.listEvents('proj1', user);
      expect(webhooksService.listEventsForProject).toHaveBeenCalledWith(
        'proj1',
        { limit: 100 },
      );
    });

    it('parses numeric limit from query string', async () => {
      const { webhooksService, retryService, workspaceAccess } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
        workspaceAccess as never,
      );
      await ctrl.listEvents('proj1', user, undefined, '50');
      expect(webhooksService.listEventsForProject).toHaveBeenCalledWith(
        'proj1',
        { limit: 50 },
      );
    });

    it('clamps limit to 500', async () => {
      const { webhooksService, retryService, workspaceAccess } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
        workspaceAccess as never,
      );
      await ctrl.listEvents('proj1', user, undefined, '9999');
      expect(webhooksService.listEventsForProject).toHaveBeenCalledWith(
        'proj1',
        { limit: 500 },
      );
    });

    it('passes status filter when provided', async () => {
      const { webhooksService, retryService, workspaceAccess } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
        workspaceAccess as never,
      );
      await ctrl.listEvents('proj1', user, WebhookEventStatus.FAILED);
      expect(webhooksService.listEventsForProject).toHaveBeenCalledWith(
        'proj1',
        expect.objectContaining({ status: WebhookEventStatus.FAILED }),
      );
    });
  });

  describe('getEvent', () => {
    it('returns event by id', async () => {
      const { webhooksService, retryService, workspaceAccess } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
        workspaceAccess as never,
      );
      const result = await ctrl.getEvent('proj1', 'evt1', user);
      expect(webhooksService.findEventForProject).toHaveBeenCalledWith(
        'evt1',
        'proj1',
      );
      expect(result).toEqual({ id: 'evt1' });
    });
  });

  describe('replayEvent', () => {
    it('delegates to retryService.replayEvent', async () => {
      const { webhooksService, retryService, workspaceAccess } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
        workspaceAccess as never,
      );
      const result = await ctrl.replayEvent('proj1', 'evt1', user);
      expect(retryService.replayEvent).toHaveBeenCalledWith('evt1');
      expect(result).toEqual({ id: 'evt1', status: 'PENDING' });
    });
  });

  describe('setEnabled', () => {
    it('enables an endpoint that belongs to the project', async () => {
      const { webhooksService, retryService, workspaceAccess } = makeServices();
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
        workspaceAccess as never,
      );
      await ctrl.setEnabled('proj1', 'ep1', { enabled: true }, user);
      expect(webhooksService.setEnabled).toHaveBeenCalledWith('ep1', true);
    });

    it('throws NotFoundException when endpoint does not belong to project', async () => {
      const { webhooksService, retryService, workspaceAccess } = makeServices({
        endpoints: [{ id: 'ep1' }],
      });
      const ctrl = new WebhookAuditController(
        webhooksService as never,
        retryService as never,
        workspaceAccess as never,
      );
      await expect(
        ctrl.setEnabled('proj1', 'ep-other', { enabled: false }, user),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
