import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { ServersCoreService } from '../services';
import { ServerValidationController } from './server-validation.controller';

describe('ServerValidationController', () => {
  const user = { id: 'user-1', role: Role.OWNER } as JwtPayload;
  const log = {
    id: 'l1',
    serverId: 'srv-1',
    message: 'ok',
    level: 'INFO',
    context: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  function build() {
    const core = {
      verifyServer: jest.fn().mockResolvedValue({ id: 'srv-1' }),
      findOne: jest.fn().mockResolvedValue({
        id: 'srv-1',
        name: 'web',
        status: 'VERIFIED',
        verificationError: null,
        lastVerifiedAt: null,
        isVerified: true,
        capabilities: [],
      }),
      getRecentVerificationLogs: jest.fn().mockResolvedValue([log]),
      listValidationResults: jest.fn().mockResolvedValue([]),
    } as unknown as ServersCoreService;
    const ctrl = new ServerValidationController(core);
    return { ctrl, core };
  }

  it('validateSsh delegates to verifyServer', async () => {
    const { ctrl, core } = build();
    await ctrl.validateSsh('srv-1', {} as never, user);
    expect(core.verifyServer).toHaveBeenCalledWith('srv-1', 'user-1');
  });

  it('getVerificationStatus builds a status payload with mapped logs', async () => {
    const { ctrl } = build();
    const res = await ctrl.getVerificationStatus('srv-1');
    expect(res).toMatchObject({ id: 'srv-1', name: 'web', isVerified: true });
    expect(res.recentLogs[0]).toMatchObject({ id: 'l1', message: 'ok' });
  });

  it('getVerificationLogs maps logs and parses the limit', async () => {
    const { ctrl, core } = build();
    const res = await ctrl.getVerificationLogs('srv-1', '5');
    expect(core.getRecentVerificationLogs).toHaveBeenCalledWith('srv-1', 5);
    expect(res[0]).toMatchObject({ id: 'l1' });
  });

  it('getValidationResults delegates', async () => {
    const { ctrl, core } = build();
    await ctrl.getValidationResults('srv-1');
    expect(core.listValidationResults).toHaveBeenCalledWith('srv-1');
  });
});
