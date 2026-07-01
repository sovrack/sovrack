import { WebhookManagementController } from './webhook-management.controller';

function makeSvc() {
  return {
    configureForService: jest.fn().mockResolvedValue({ hookId: 1, url: 'https://hook' }),
    configureForProject: jest.fn().mockResolvedValue({ hookId: 2, url: 'https://hook' }),
    getStatusForService: jest.fn().mockResolvedValue({ active: true }),
    getStatus: jest.fn().mockResolvedValue({ active: false }),
    setActiveForService: jest.fn().mockResolvedValue(undefined),
    setActive: jest.fn().mockResolvedValue(undefined),
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

    it('calls configureForProject when no serviceId', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      await ctrl.configure('proj1', undefined, 'envId1');
      expect(svc.configureForProject).toHaveBeenCalledWith('proj1', 'envId1');
    });
  });

  describe('status', () => {
    it('calls getStatusForService when serviceId is given', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      const result = await ctrl.status('proj1', 'svc1');
      expect(svc.getStatusForService).toHaveBeenCalledWith('svc1');
      expect(result).toEqual({ active: true });
    });

    it('calls getStatus when no serviceId', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      await ctrl.status('proj1', undefined, 'env1');
      expect(svc.getStatus).toHaveBeenCalledWith('proj1', 'env1');
    });
  });

  describe('pause', () => {
    it('calls setActiveForService(false) when serviceId is given', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      const result = await ctrl.pause('proj1', 'svc1');
      expect(svc.setActiveForService).toHaveBeenCalledWith('svc1', false);
      expect(result).toEqual({ status: 'paused' });
    });

    it('calls setActive(false) for project when no serviceId', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      const result = await ctrl.pause('proj1');
      expect(svc.setActive).toHaveBeenCalledWith('proj1', false, undefined);
      expect(result).toEqual({ status: 'paused' });
    });
  });

  describe('resume', () => {
    it('calls setActiveForService(true) when serviceId is given', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      const result = await ctrl.resume('proj1', 'svc1');
      expect(svc.setActiveForService).toHaveBeenCalledWith('svc1', true);
      expect(result).toEqual({ status: 'resumed' });
    });

    it('calls setActive(true) for project when no serviceId', async () => {
      const svc = makeSvc();
      const ctrl = new WebhookManagementController(svc as never);
      const result = await ctrl.resume('proj1');
      expect(svc.setActive).toHaveBeenCalledWith('proj1', true, undefined);
      expect(result).toEqual({ status: 'resumed' });
    });
  });
});
