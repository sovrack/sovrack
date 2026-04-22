'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { useAuth } from '@/hooks/useAuth';
import { auditLogsService } from '@/services/audit-logs.service';
import { getApiErrorMessage } from '@/lib/api';
import type { AuditLogItem, AuditLogPage } from '@/types/audit-log';

const PAGE_SIZE = 20;

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(parsed);
}

function metadataPreview(metadata: Record<string, unknown> | null): string {
  if (!metadata) {
    return '-';
  }

  const entries = Object.entries(metadata).slice(0, 2);
  if (entries.length === 0) {
    return '-';
  }

  return entries
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' · ');
}

export default function AuditLogsSettingsPage() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuditLogPage | null>(null);

  const rows = useMemo<AuditLogItem[]>(() => result?.data ?? [], [result]);

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await auditLogsService.getAll({
        page,
        limit: PAGE_SIZE,
      });
      setResult(next);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Audit Logs"
          description="Audit logs are only available to administrators."
        />
        <Alert tone="warning">
          You do not have permission to view audit logs.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Audit Logs"
        description="Track security and platform operations across users."
        actions={(
          <Button
            variant="secondary"
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </Button>
        )}
      />

      {error && <Alert tone="error">{error}</Alert>}

      <SectionCard contentClassName="!p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--border)]">
            <thead className="bg-[var(--bg-card)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  Resource
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                  Metadata
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <Loader2 size={20} className="mx-auto animate-spin text-[var(--text-secondary)]" />
                  </td>
                </tr>
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <ClipboardList className="mx-auto h-8 w-8 text-[var(--text-secondary)]" />
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">No audit logs found.</p>
                  </td>
                </tr>
              )}

              {!loading &&
                rows.map((log) => (
                  <tr key={log.id} className="bg-[var(--bg-app)]">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-[var(--text-secondary)]">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-primary)]">
                      <p className="font-medium">{log.user.fullName}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{log.user.email}</p>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
                      {log.action}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                      {log.resourceType} · {log.resourceId}
                    </td>
                    <td className="max-w-[360px] truncate px-4 py-3 text-sm text-[var(--text-secondary)]">
                      {metadataPreview(log.metadata)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Pagination
        page={result?.page ?? page}
        totalPages={result?.totalPages ?? 1}
        onPageChange={(nextPage) => setPage(nextPage)}
      />
    </div>
  );
}
