import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DatabaseBackupsPanel } from './database-backups-panel';
import { databaseBackupsService } from '@/features/databases/api/database-backups.service';

vi.mock('@/features/databases/api/database-backups.service', () => ({
  databaseBackupsService: {
    list: vi.fn(),
    create: vi.fn(),
    restore: vi.fn(),
  },
}));

const confirmMock = vi.fn();
vi.mock('@/shared/contexts/confirm-context', () => ({
  useConfirm: () => confirmMock,
}));

const mocked = vi.mocked(databaseBackupsService);

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DatabaseBackupsPanel serviceEnvId="env-1" />
    </QueryClientProvider>,
  );
}

const successBackup = {
  id: 'bk-1',
  serviceEnvironmentId: 'env-1',
  status: 'SUCCESS' as const,
  trigger: 'MANUAL' as const,
  storagePath: '/x',
  sizeBytes: 2048,
  error: null,
  startedAt: null,
  finishedAt: null,
  createdAt: new Date().toISOString(),
};

describe('DatabaseBackupsPanel — restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.list.mockResolvedValue([successBackup]);
    mocked.restore.mockResolvedValue({ ok: true, warnings: null });
  });

  afterEach(() => vi.restoreAllMocks());

  it('restores a SUCCESS backup after the user confirms', async () => {
    confirmMock.mockResolvedValue(true);
    renderPanel();

    const btn = await screen.findByRole('button', { name: /restore/i });
    fireEvent.click(btn);

    await waitFor(() =>
      expect(mocked.restore).toHaveBeenCalledWith('env-1', 'bk-1'),
    );
  });

  it('does NOT restore when the user cancels the confirm dialog', async () => {
    confirmMock.mockResolvedValue(false);
    renderPanel();

    const btn = await screen.findByRole('button', { name: /restore/i });
    fireEvent.click(btn);

    // Let the (rejected) confirm promise settle, then assert no restore happened.
    await Promise.resolve();
    expect(mocked.restore).not.toHaveBeenCalled();
  });

  it('shows no Restore button for a non-SUCCESS backup', async () => {
    mocked.list.mockResolvedValue([{ ...successBackup, status: 'FAILED' }]);
    renderPanel();

    // Wait for the list to render, then assert no restore action is offered.
    await waitFor(() =>
      expect(screen.queryByText(/just now|ago/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: /restore/i }),
    ).not.toBeInTheDocument();
  });
});
