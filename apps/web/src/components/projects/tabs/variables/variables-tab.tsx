'use client';

import { Info, KeyRound } from 'lucide-react';
import { ProjectConfigsTab } from '@/components/projects/project-configs-tab';

type Props = {
  projectId: string;
};

export function VariablesTab({ projectId }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--hover)]">
            <KeyRound size={16} className="text-[var(--text-secondary)]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Global environment variables</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Injected into every deployment regardless of environment. Per-environment overrides are managed in the Environments tab.
            </p>
          </div>
        </div>
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/8 px-3 py-2 text-xs text-blue-300">
          <Info size={12} className="shrink-0" />
          Values are stored encrypted. They are never exposed in logs or build output.
          Per-environment overrides → <strong className="ml-1">Environments tab</strong>
        </div>
        <ProjectConfigsTab projectId={projectId} />
      </div>
    </div>
  );
}
