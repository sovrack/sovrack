import { Role } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';

describe('DashboardController', () => {
  it('getStats delegates to the dashboard service with the caller identity', async () => {
    const dashboard = {
      getStats: jest.fn().mockResolvedValue({ projects: 1 }),
    } as unknown as DashboardService;
    const ctrl = new DashboardController(dashboard);
    const user = { id: 'u1', role: Role.MEMBER } as JwtPayload;
    const res = await ctrl.getStats(user);
    expect(dashboard.getStats).toHaveBeenCalledWith('u1', Role.MEMBER);
    expect(res).toEqual({ projects: 1 });
  });
});
