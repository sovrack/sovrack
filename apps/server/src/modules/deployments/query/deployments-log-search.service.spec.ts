import { Role } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { DeploymentsQueryService } from './deployments-query.service';
import { DeploymentsLogSearchService } from './deployments-log-search.service';

describe('DeploymentsLogSearchService', () => {
  const LOGS = [
    'Pulling image platform/app:main',
    '[HEALTH] Attempt 1/6 -> HTTP 503 (app starting...)',
    'ERROR: connection refused on port 3000',
    '[HEALTH] Attempt 2/6 -> HTTP 200 OK',
    'WARN: deprecated env var used',
    'Deployment succeeded',
  ].join('\n');

  function makeService(logs: string | null = LOGS) {
    const prisma = {
      deployment: { findUnique: jest.fn().mockResolvedValue({ logs }) },
    } as unknown as PrismaService;
    const query = {
      findOne: jest.fn().mockResolvedValue({ id: 'd1' }),
    } as unknown as DeploymentsQueryService;
    return new DeploymentsLogSearchService(prisma, query);
  }

  it('filters by case-insensitive substring', async () => {
    const res = await makeService().searchLogs(
      'd1',
      'u1',
      Role.ADMIN,
      'health',
    );
    expect(res.total).toBe(2);
    expect(
      res.hits.every((h) => h.message.toLowerCase().includes('health')),
    ).toBe(true);
  });

  it('infers ERROR / WARN levels and filters on them', async () => {
    const errors = await makeService().searchLogs(
      'd1',
      'u1',
      Role.ADMIN,
      '',
      'ERROR',
    );
    expect(errors.hits).toHaveLength(1);
    expect(errors.hits[0].level).toBe('ERROR');

    const warns = await makeService().searchLogs(
      'd1',
      'u1',
      Role.ADMIN,
      '',
      'WARN',
    );
    expect(warns.hits).toHaveLength(1);
    expect(warns.hits[0].level).toBe('WARN');
  });

  it('returns line numbers (1-based)', async () => {
    const res = await makeService().searchLogs(
      'd1',
      'u1',
      Role.ADMIN,
      'connection refused',
    );
    expect(res.hits[0].lineNumber).toBe(3);
  });

  it('handles empty logs without crashing', async () => {
    const res = await makeService(null).searchLogs(
      'd1',
      'u1',
      Role.ADMIN,
      'error',
    );
    expect(res).toEqual({ hits: [], total: 0 });
  });

  it('authorizes via DeploymentsQueryService.findOne', async () => {
    const prisma = {
      deployment: { findUnique: jest.fn().mockResolvedValue({ logs: LOGS }) },
    } as unknown as PrismaService;
    const findOne = jest.fn().mockResolvedValue({ id: 'd1' });
    const query = { findOne } as unknown as DeploymentsQueryService;
    await new DeploymentsLogSearchService(prisma, query).searchLogs(
      'd1',
      'u1',
      Role.DEVELOPER,
      'x',
    );
    expect(findOne).toHaveBeenCalledWith('d1', 'u1', Role.DEVELOPER);
  });
});
