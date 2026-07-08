import { BadRequestException } from '@nestjs/common';
import { WebhookManagementController } from './webhook-management.controller';

function makeSvc() {
  return {
    configureForService: jest
      .fn()
      .mockResolvedValue({ hookId: 1, url: 'https://hook' }),
    getStatusForService: jest.fn().mockResolvedValue({ active: true }),
    setActiveForService: jest.fn().mockResolvedValue(undefined),
  };
}

describe('WebhookManagementController', () => {
  describe('configure', () => {
    it('calls configureForService when serviceId is given', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      const result = await ctrl.configure('proj1', 'svc1');
      expect(svc.configureForService).toHaveBeenCalledWith('proj1', 'svc1');
      expect(result).toEqual({ hookId: 1, url: 'https://hook' });
    });

    it('rejects with 400 when serviceId is missing', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      await expect(ctrl.configure('proj1', undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(svc.configureForService).not.toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('calls getStatusForService when serviceId is given', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      const result = await ctrl.status('svc1');
      expect(svc.getStatusForService).toHaveBeenCalledWith('svc1');
      expect(result).toEqual({ active: true });
    });

    it('rejects with 400 when serviceId is missing', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      await expect(ctrl.status(undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('pause', () => {
    it('calls setActiveForService(false) when serviceId is given', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      const result = await ctrl.pause('svc1');
      expect(svc.setActiveForService).toHaveBeenCalledWith('svc1', false);
      expect(result).toEqual({ status: 'paused' });
    });

    it('rejects with 400 when serviceId is missing', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      await expect(ctrl.pause(undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('resume', () => {
    it('calls setActiveForService(true) when serviceId is given', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      const result = await ctrl.resume('svc1');
      expect(svc.setActiveForService).toHaveBeenCalledWith('svc1', true);
      expect(result).toEqual({ status: 'resumed' });
    });

    it('rejects with 400 when serviceId is missing', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      await expect(ctrl.resume(undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
