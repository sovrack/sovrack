import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { AutomationService } from '../services/automation.service';
import { AutomationController } from './automation.controller';

describe('AutomationController', () => {
  const user = { id: 'user-1', role: Role.ADMIN } as JwtPayload;

  function build() {
    const automationService = {
      getActions: jest.fn().mockReturnValue([]),
      getRuns: jest.fn().mockResolvedValue({ items: [] }),
      getRun: jest.fn().mockResolvedValue({ id: 'r1' }),
      getRunLogs: jest.fn().mockResolvedValue([]),
      startRun: jest.fn().mockResolvedValue({ id: 'r1' }),
      cancelRun: jest.fn().mockResolvedValue({ id: 'r1' }),
      deleteRun: jest.fn().mockResolvedValue({ id: 'r1' }),
    } as unknown as AutomationService;
    const ctrl = new AutomationController(automationService);
    return { ctrl, automationService };
  }

  it('getActions / getRun / startRun / cancelRun / deleteRun delegate', () => {
    const { ctrl, automationService } = build();
    ctrl.getActions();
    ctrl.getRun('r1');
    ctrl.startRun({ action: 'X' } as never, user);
    ctrl.cancelRun('r1', user);
    ctrl.deleteRun('r1');
    expect(automationService.getActions).toHaveBeenCalled();
    expect(automationService.getRun).toHaveBeenCalledWith('r1');
    expect(automationService.startRun).toHaveBeenCalledWith(
      { action: 'X' },
      'user-1',
    );
    expect(automationService.cancelRun).toHaveBeenCalledWith('r1', 'user-1');
    expect(automationService.deleteRun).toHaveBeenCalledWith('r1');
  });

  it('getRuns parses pagination with defaults', () => {
    const { ctrl, automationService } = build();
    ctrl.getRuns('2', '50');
    ctrl.getRuns(undefined, undefined);
    expect(automationService.getRuns).toHaveBeenNthCalledWith(1, 2, 50);
    expect(automationService.getRuns).toHaveBeenNthCalledWith(2, 1, 20);
  });

  it('getRunLogs parses afterLine and ignores invalid values', () => {
    const { ctrl, automationService } = build();
    ctrl.getRunLogs('r1', '10');
    ctrl.getRunLogs('r1', 'abc');
    expect(automationService.getRunLogs).toHaveBeenNthCalledWith(1, 'r1', 10);
    expect(automationService.getRunLogs).toHaveBeenNthCalledWith(
      2,
      'r1',
      undefined,
    );
  });
});
