import { ACTIVE_FILTER, activeWhere } from './prisma-active.helper';

describe('prisma-active.helper (soft-delete)', () => {
  it('ACTIVE_FILTER targets non-archived rows', () => {
    expect(ACTIVE_FILTER).toEqual({ archivedAt: null });
  });

  it('activeWhere() forces archivedAt: null on an empty where', () => {
    expect(activeWhere()).toEqual({ archivedAt: null });
  });

  it('merges the caller conditions and forces archivedAt: null', () => {
    expect(activeWhere({ projectId: 'p1', name: 'api' })).toEqual({
      projectId: 'p1',
      name: 'api',
      archivedAt: null,
    });
  });

  it('archivedAt is always forced to null even if the caller set it', () => {
    // The active filter must win — an explicit non-null archivedAt is overridden.
    const result = activeWhere({ archivedAt: new Date() }) as {
      archivedAt: Date | null;
    };
    expect(result.archivedAt).toBeNull();
  });
});
