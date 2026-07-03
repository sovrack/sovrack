"use client";

import { Loader2 } from "lucide-react";

type AutoDeployControlProps = {
  environmentId: string;
  autoDeploy: boolean;
  setAutoDeploy: (v: boolean) => void;
  autoBranch: string;
  setAutoBranch: (v: string) => void;
  disabled: boolean;
  isBusy: boolean;
};

/**
 * "Auto-deploy on push" — split out of ServiceConfigForm to stay under the
 * file-size gate. Moved here from the old Variables tab (Task 1, "Correction
 * rapide" mission), placed next to Deployment trigger — see
 * service-config-form.tsx's doc comment for why this is a DISTINCT setting
 * from Deployment trigger, not a duplicate.
 */
export function AutoDeployControl({
  environmentId,
  autoDeploy,
  setAutoDeploy,
  autoBranch,
  setAutoBranch,
  disabled,
  isBusy,
}: AutoDeployControlProps) {
  if (!environmentId) {
    return (
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Select an environment above to configure.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2">
      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={autoDeploy}
          disabled={disabled}
          onChange={(e) => setAutoDeploy(e.target.checked)}
        />
        Enabled
      </label>
      <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        branch
        <input
          value={autoBranch}
          onChange={(e) => setAutoBranch(e.target.value)}
          placeholder="main"
          disabled={!autoDeploy || disabled}
          className="w-32 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none disabled:opacity-50"
        />
      </span>
      {isBusy && (
        <Loader2
          size={13}
          className="animate-spin text-[var(--text-muted)]"
        />
      )}
    </div>
  );
}
