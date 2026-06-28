import { Badge } from '@/shared/ui/badge';
import type { ServerValidationResult } from '@/features/servers/types/server';

type Props = {
  results: ServerValidationResult[];
};

export function ServerValidationCard({ results }: Props) {
  const latest = results[0];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
            Validation
          </p>
          <h3 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
            SSH readiness
          </h3>
        </div>
        <Badge tone={latest?.sudoAvailable ? 'success' : 'warning'}>
          {latest?.sudoAvailable ? 'sudo ready' : 'needs validation'}
        </Badge>
      </div>

      {!latest ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          No SSH validation has been persisted yet.
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-[var(--text-secondary)]">SSH reachable</dt>
            <dd className="font-semibold text-[var(--text-primary)]">
              {latest.sshReachable ? 'Yes' : 'No'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-secondary)]">Auth</dt>
            <dd className="font-semibold text-[var(--text-primary)]">
              {latest.authSucceeded ? 'Succeeded' : 'Failed'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-secondary)]">sudo -n true</dt>
            <dd className="font-semibold text-[var(--text-primary)]">
              {latest.sudoAvailable ? 'Available' : 'Missing'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-secondary)]">Python 3</dt>
            <dd className="font-semibold text-[var(--text-primary)]">
              {latest.pythonAvailable ? 'Available' : 'Missing'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-secondary)]">OS</dt>
            <dd className="font-semibold text-[var(--text-primary)]">
              {[latest.osName, latest.osVersion].filter(Boolean).join(' ') || 'Unknown'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-secondary)]">Architecture</dt>
            <dd className="font-semibold text-[var(--text-primary)]">
              {latest.architecture || 'Unknown'}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
