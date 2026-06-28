import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useGitProviders } from './use-git-providers';
import { platformConfigService } from '@/features/platform/api/platform-config.service';
import type { GitlabProvider } from '@/features/platform/types/platform-config';

vi.mock('@/features/platform/api/platform-config.service', () => ({
  platformConfigService: {
    listGitlabProviders: vi.fn(),
    listGithubProviders: vi.fn(),
    listGiteaProviders: vi.fn(),
  },
}));

const mocked = vi.mocked(platformConfigService);

const aProvider = (over: Partial<GitlabProvider> = {}): GitlabProvider => ({
  id: 'gp1',
  name: 'Main',
  type: 'GITLAB',
  gitlabUrl: 'https://gitlab.com',
  internalUrl: 'https://gitlab.com',
  redirectUri: '',
  applicationId: '',
  applicationSecretConfigured: false,
  groupNames: '',
  adminTokenConfigured: true,
  oauthTokenConfigured: false,
  oauthExpiresAt: null,
  status: 'CONFIGURED',
  isDefault: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

describe('useGitProviders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges the three provider sources and tags each with its providerType', async () => {
    mocked.listGitlabProviders.mockResolvedValue([aProvider({ id: 'gl' })]);
    mocked.listGithubProviders.mockResolvedValue([aProvider({ id: 'gh' })]);
    mocked.listGiteaProviders.mockResolvedValue([aProvider({ id: 'gt' })]);

    const { wrapper } = setup();
    const { result } = renderHook(() => useGitProviders(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data ?? [];
    expect(data).toHaveLength(3);
    expect(data.find((p) => p.id === 'gl')?.providerType).toBe('GITLAB');
    expect(data.find((p) => p.id === 'gh')?.providerType).toBe('GITHUB');
    expect(data.find((p) => p.id === 'gt')?.providerType).toBe('GITEA');
  });

  it('tolerates one source failing (allSettled) and returns the others', async () => {
    mocked.listGitlabProviders.mockResolvedValue([aProvider({ id: 'gl' })]);
    mocked.listGithubProviders.mockRejectedValue(new Error('github down'));
    mocked.listGiteaProviders.mockResolvedValue([]);

    const { wrapper } = setup();
    const { result } = renderHook(() => useGitProviders(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data ?? [];
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('gl');
  });
});
