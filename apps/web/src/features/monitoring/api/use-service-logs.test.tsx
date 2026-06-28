import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useServiceLogs } from './use-service-logs';
import { logsService } from './logs.service';

vi.mock('./logs.service', () => ({
  logsService: { searchPersisted: vi.fn() },
}));

const mocked = vi.mocked(logsService);

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

const emptyResult = {
  configured: true,
  reachable: true,
  serviceEnvId: 'env-1',
  from: 0,
  to: 0,
  total: 0,
  entries: [],
};

describe('useServiceLogs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stays idle (no fetch) when serviceEnvId is null', () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useServiceLogs(null, { fromMinutes: 60 }),
      { wrapper },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(mocked.searchPersisted).not.toHaveBeenCalled();
  });

  it('queries with a computed from/to window and forwards the search term', async () => {
    mocked.searchPersisted.mockResolvedValue(emptyResult);
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useServiceLogs('env-1', { fromMinutes: 60, search: 'error', limit: 1000 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocked.searchPersisted).toHaveBeenCalledTimes(1);
    const [serviceEnvId, params] = mocked.searchPersisted.mock.calls[0];
    expect(serviceEnvId).toBe('env-1');
    expect(params.search).toBe('error');
    expect(params.limit).toBe(1000);
    // The 1h window must be ~3_600_000 ms wide.
    const width = new Date(params.to as string).getTime() - new Date(params.from as string).getTime();
    expect(Math.abs(width - 3_600_000)).toBeLessThan(5_000);
  });
});
