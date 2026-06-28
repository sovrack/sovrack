import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { RuntimeLogsService } from '../services/runtime-logs.service';
import { RuntimeLogsController } from './runtime-logs.controller';

describe('RuntimeLogsController', () => {
  const user = { id: 'user-1', role: Role.ADMIN } as JwtPayload;

  function build() {
    const runtimeLogs = {
      searchServiceLogs: jest.fn().mockResolvedValue({ lines: [] }),
    } as unknown as RuntimeLogsService;
    const ctrl = new RuntimeLogsController(runtimeLogs);
    return { ctrl, runtimeLogs };
  }

  it('parses tail and forwards search options', async () => {
    const { ctrl, runtimeLogs } = build();
    await ctrl.searchServiceLogs('se1', user, '100', 'error', 'stderr');
    expect(runtimeLogs.searchServiceLogs).toHaveBeenCalledWith(
      'se1',
      'user-1',
      Role.ADMIN,
      {
        tail: 100,
        search: 'error',
        stream: 'stderr',
      },
    );
  });

  it('omits tail when not provided', async () => {
    const { ctrl, runtimeLogs } = build();
    await ctrl.searchServiceLogs('se1', user, undefined, undefined, undefined);
    expect(runtimeLogs.searchServiceLogs).toHaveBeenCalledWith(
      'se1',
      'user-1',
      Role.ADMIN,
      {
        tail: undefined,
        search: undefined,
        stream: undefined,
      },
    );
  });
});
