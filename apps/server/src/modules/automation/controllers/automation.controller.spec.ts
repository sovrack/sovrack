import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { AutomationService } from '../services/automation.service';
import { AutomationController } from './automation.controller';

describe('AutomationController', () => {
  const user = { id: 'user-1', role: Role.OWNER } as JwtPayload;
  const workspaceId = 'workspace-1';

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

  it('getActions / getRun / startRun / cancelRun / deleteRun delegate', async () => {
    const { ctrl, automationService } = build();
    ctrl.getActions();
    await ctrl.getRun('r1', workspaceId);
    await ctrl.startRun({ action: 'X' } as never, workspaceId, user);
    await ctrl.cancelRun('r1', workspaceId, user);
    await ctrl.deleteRun('r1', workspaceId);
    expect(automationService.getActions).toHaveBeenCalled();
    expect(automationService.getRun).toHaveBeenCalledWith('r1', workspaceId);
    expect(automationService.startRun).toHaveBeenCalledWith(
      { action: 'X' },
      workspaceId,
      'user-1',
    );
    expect(automationService.cancelRun).toHaveBeenCalledWith(
      'r1',
      workspaceId,
      'user-1',
    );
    expect(automationService.deleteRun).toHaveBeenCalledWith('r1', workspaceId);
  });

  it('getRuns forwards the validated pagination DTO as-is', async () => {
    const { ctrl, automationService } = build();
    await ctrl.getRuns(workspaceId, { page: 2, pageSize: 50 });
    await ctrl.getRuns(workspaceId, {});
    expect(automationService.getRuns).toHaveBeenNthCalledWith(1, workspaceId, {
      page: 2,
      pageSize: 50,
    });
    expect(automationService.getRuns).toHaveBeenNthCalledWith(
      2,
      workspaceId,
      {},
    );
  });

  it('getRunLogs parses afterLine and ignores invalid values', async () => {
    const { ctrl, automationService } = build();
    await ctrl.getRunLogs('r1', workspaceId, '10');
    await ctrl.getRunLogs('r1', workspaceId, 'abc');
    expect(automationService.getRunLogs).toHaveBeenNthCalledWith(
      1,
      'r1',
      workspaceId,
      10,
    );
    expect(automationService.getRunLogs).toHaveBeenNthCalledWith(
      2,
      'r1',
      workspaceId,
      undefined,
    );
  });
});
