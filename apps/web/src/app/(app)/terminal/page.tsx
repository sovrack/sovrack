'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Monitor, RefreshCw, TerminalSquare } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { deploymentsService } from '@/services/deployments.service';
import { getApiErrorMessage } from '@/lib/api';
import type { Deployment } from '@/types/deployment';

export default function TerminalPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await deploymentsService.getAll();
      setDeployments(all);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recent = useMemo(() => deployments.slice(0, 10), [deployments]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Terminal"
        description="Open deployment logs quickly from a central terminal entry point."
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

      <SectionCard
        title="How to use"
        description="Each deployment opens a live terminal view on its detail page."
      >
        <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
          <li>1. Choose a deployment below.</li>
          <li>2. Open its detail page.</li>
          <li>3. Watch real-time logs in the terminal panel.</li>
        </ul>
      </SectionCard>

      <SectionCard
        title="Recent Deployments"
        description="Quick access to deployment terminals."
      >
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={22} className="animate-spin text-[var(--text-secondary)]" />
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] px-4 py-8 text-center">
            <TerminalSquare className="mx-auto h-8 w-8 text-[var(--text-secondary)]" />
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              No deployments yet. Launch one to access terminal logs.
            </p>
            <Link
              href="/deployments/new"
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
            >
              <Monitor size={14} />
              New deployment
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((deployment) => (
              <Link
                key={deployment.id}
                href={`/deployments/${deployment.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 transition hover:bg-[var(--hover)]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {deployment.id}
                  </p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">
                    Branch: {deployment.branch} · Status: {deployment.status}
                  </p>
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  Open logs
                </span>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
