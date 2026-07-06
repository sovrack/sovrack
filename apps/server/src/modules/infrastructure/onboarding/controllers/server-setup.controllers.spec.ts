import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { ServerSetupService } from '../services/infra-setup.service';
import { ServerSetupController } from './server-setup.controller';
import { ServerSetupsController } from './server-setups.controller';

describe('Server setup controllers', () => {
  const user = { id: 'user-1', role: Role.ADMIN } as JwtPayload;

  function prepService() {
    return {
      startSetup: jest.fn().mockResolvedValue({ id: 'prep-1' }),
      listSetups: jest.fn().mockResolvedValue([]),
      getSetupReadiness: jest.fn().mockResolvedValue({ isReady: true }),
      getSetup: jest.fn().mockResolvedValue({ id: 'prep-1' }),
      getSetupLogs: jest.fn().mockResolvedValue([]),
      retrySetup: jest.fn().mockResolvedValue({ id: 'prep-2' }),
      cancelSetup: jest.fn().mockResolvedValue({ id: 'prep-1' }),
    } as unknown as ServerSetupService;
  }

  describe('ServerSetupController', () => {
    it('startSetup delegates and returns the run', async () => {
      const prep = prepService();
      const ctrl = new ServerSetupController(prep);
      const res = await ctrl.startSetup(
        'srv-1',
        { profile: 'BASIC' } as never,
        user,
      );
      expect(prep.startSetup).toHaveBeenCalledWith(
        'srv-1',
        { profile: 'BASIC' },
        'user-1',
      );
      expect(res).toEqual({ id: 'prep-1' });
    });

    it('re-throws HTTP exceptions unchanged', async () => {
      const prep = prepService();
      (prep.startSetup as jest.Mock).mockRejectedValueOnce(
        new BadRequestException('not ready'),
      );
      const ctrl = new ServerSetupController(prep);
      await expect(
        ctrl.startSetup('srv-1', {} as never, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('wraps unexpected errors in a 500', async () => {
      const prep = prepService();
      (prep.startSetup as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      const ctrl = new ServerSetupController(prep);
      await expect(
        ctrl.startSetup('srv-1', {} as never, user),
      ).rejects.toMatchObject({ status: 500 });
    });

    it('listSetups / getSetupReadiness delegate', async () => {
      const prep = prepService();
      const ctrl = new ServerSetupController(prep);
      await ctrl.listSetups('srv-1');
      await ctrl.getSetupReadiness('srv-1');
      expect(prep.listSetups).toHaveBeenCalledWith('srv-1');
      expect(prep.getSetupReadiness).toHaveBeenCalledWith('srv-1');
    });
  });

  describe('ServerSetupsController', () => {
    it('findOne / logs / retry / cancel delegate', async () => {
      const prep = prepService();
      const ctrl = new ServerSetupsController(prep);
      await ctrl.findOne('prep-1');
      await ctrl.logs('prep-1', '5');
      await ctrl.logs('prep-1', undefined);
      await ctrl.retry('prep-1', { reason: 'x' } as never, user);
      await ctrl.cancel('prep-1', user);
      expect(prep.getSetup).toHaveBeenCalledWith('prep-1');
      expect(prep.getSetupLogs).toHaveBeenCalledWith('prep-1', 5);
      expect(prep.getSetupLogs).toHaveBeenCalledWith('prep-1', undefined);
      expect(prep.retrySetup).toHaveBeenCalledWith(
        'prep-1',
        { reason: 'x' },
        'user-1',
      );
      expect(prep.cancelSetup).toHaveBeenCalledWith('prep-1', 'user-1');
    });
  });
});
