import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useServiceDomains, useCreateDomain, useDeleteDomain } from './use-domains';
import { dnsService } from '@/features/platform/api/dns.service';
import type { Domain } from '@/features/platform/types/dns';

vi.mock('@/features/platform/api/dns.service', () => ({
  dnsService: {
    listDomains: vi.fn(),
    createDomain: vi.fn(),
    deleteDomain: vi.fn(),
  },
}));

const mocked = vi.mocked(dnsService);

const aDomain = (over: Partial<Domain> = {}): Domain => ({
  id: 'd1',
  name: 'app.example.com',
  providerId: null,
  projectId: null,
  verified: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe('useServiceDomains', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stays idle (no fetch) when serviceEnvId is null', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useServiceDomains(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mocked.listDomains).not.toHaveBeenCalled();
  });

  it('fetches the domains of a service environment', async () => {
    mocked.listDomains.mockResolvedValue([aDomain()]);
    const { wrapper } = setup();
    const { result } = renderHook(() => useServiceDomains('env-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.listDomains).toHaveBeenCalledWith({ serviceEnvId: 'env-1' });
    expect(result.current.data).toHaveLength(1);
  });
});

describe('useCreateDomain', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a domain then invalidates the domains cache', async () => {
    mocked.createDomain.mockResolvedValue(aDomain({ id: 'd2' }));
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCreateDomain('env-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'b.example.com', projectId: 'p1' });
    });

    expect(mocked.createDomain).toHaveBeenCalledWith({
      name: 'b.example.com',
      projectId: 'p1',
      serviceEnvId: 'env-1',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['service-domains', 'env-1'] });
  });
});

describe('useDeleteDomain', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes a domain then invalidates the domains cache', async () => {
    mocked.deleteDomain.mockResolvedValue(undefined);
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteDomain('env-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('d1');
    });

    expect(mocked.deleteDomain).toHaveBeenCalledWith('d1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['service-domains', 'env-1'] });
  });
});
