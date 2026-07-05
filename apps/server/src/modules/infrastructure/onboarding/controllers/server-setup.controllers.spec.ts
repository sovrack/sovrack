import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { ServerSetupService } from '../services/infra-setup.service';
import { ServerSetupController } from './server-setup.controller';
import { ServerSetupsController } from './server-setups.controller';

describe('Server preparation controllers', () => {
  const user = { id: 'user-1', role: Role.ADMIN } as JwtPayload;

  function prepService() {
    return {
      startPreparation: jest.fn().mockResolvedValue({ id: 'prep-1' }),
      listPreparations: jest.fn().mockResolvedValue([]),
      getPreparationReadiness: jest.fn().mockResolvedValue({ isReady: true }),
      getPreparation: jest.fn().mockResolvedValue({ id: 'prep-1' }),
      getPreparationLogs: jest.fn().mockResolvedValue([]),
      retryPreparation: jest.fn().mockResolvedValue({ id: 'prep-2' }),
      cancelPreparation: jest.fn().mockResolvedValue({ id: 'prep-1' }),
    } as unknown as ServerSetupService;
  }

  describe('ServerSetupController', () => {
    it('startPreparation delegates and returns the run', async () => {
      const prep = prepService();
      const ctrl = new ServerSetupController(prep);
      const res = await ctrl.startPreparation(
        'srv-1',
        { profile: 'BASIC' } as never,
        user,
      );
      expect(prep.startPreparation).toHaveBeenCalledWith(
        'srv-1',
        { profile: 'BASIC' },
        'user-1',
      );
      expect(res).toEqual({ id: 'prep-1' });
    });

    it('re-throws HTTP exceptions unchanged', async () => {
      const prep = prepService();
      (prep.startPreparation as jest.Mock).mockRejectedValueOnce(
        new BadRequestException('not ready'),
      );
      const ctrl = new ServerSetupController(prep);
      await expect(
        ctrl.startPreparation('srv-1', {} as never, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('wraps unexpected errors in a 500', async () => {
      const prep = prepService();
      (prep.startPreparation as jest.Mock).mockRejectedValueOnce(
        new Error('boom'),
      );
      const ctrl = new ServerSetupController(prep);
      await expect(
        ctrl.startPreparation('srv-1', {} as never, user),
      ).rejects.toMatchObject({ status: 500 });
    });

    it('listPreparations / getPreparationReadiness delegate', async () => {
      const prep = prepService();
      const ctrl = new ServerSetupController(prep);
      await ctrl.listPreparations('srv-1');
      await ctrl.getPreparationReadiness('srv-1');
      expect(prep.listPreparations).toHaveBeenCalledWith('srv-1');
      expect(prep.getPreparationReadiness).toHaveBeenCalledWith('srv-1');
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
      expect(prep.getPreparation).toHaveBeenCalledWith('prep-1');
      expect(prep.getPreparationLogs).toHaveBeenCalledWith('prep-1', 5);
      expect(prep.getPreparationLogs).toHaveBeenCalledWith('prep-1', undefined);
      expect(prep.retryPreparation).toHaveBeenCalledWith(
        'prep-1',
        { reason: 'x' },
        'user-1',
      );
      expect(prep.cancelPreparation).toHaveBeenCalledWith('prep-1', 'user-1');
    });
  });
});
