"use client";

import {
  Globe,
  Loader2,
  RefreshCw,
  Rocket,
  StopCircle,
  TerminalSquare,
} from "lucide-react";
import { DeploymentStatusBadge } from "@/features/deployments";
import { useI18n } from "@/shared/i18n/language-context";
import type { Deployment } from "@/features/deployments/types";

type Props = {
  redeploying: boolean;
  stopping: boolean;
  effectiveEnvId: string;
  envName: string | undefined;
  lastDeployment: Deployment | null;
  appUrl: string | null;
  onDeploy: () => void;
  onRedeploy: () => void;
  onStop: () => void;
  onTerminal: () => void;
  allowTerminal?: boolean;
};

/**
 * F-8 fix: Deploy action bar extracted from the 418-line service page into its
 * own component (single responsibility — actions only).
 */
export function ServiceDeployBar({
  redeploying,
  stopping,
  effectiveEnvId,
  envName,
  lastDeployment,
  appUrl,
  onDeploy,
  onRedeploy,
  onStop,
  onTerminal,
  allowTerminal = true,
}: Props) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
      {allowTerminal && <button
        type="button"
        onClick={onDeploy}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover"
      >
        <Rocket size={15} /> {t("Deploy")}
      </button>}

      <button
        type="button"
        onClick={onRedeploy}
        disabled={redeploying}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-primary transition hover:bg-hover/10 disabled:opacity-50"
      >
        {redeploying ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <RefreshCw size={15} />
        )}{" "}
        {t("Redeploy")}
      </button>

      <button
        type="button"
        onClick={onStop}
        disabled={stopping}
        className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
      >
        {stopping ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <StopCircle size={15} />
        )}{" "}
        {t("Stop")}
      </button>

      <button
        type="button"
        onClick={onTerminal}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-primary transition hover:bg-hover/10"
      >
        <TerminalSquare size={15} /> {t("Terminal")}
        {effectiveEnvId && (
          <span className="rounded-md bg-hover/10 px-1.5 py-0.5 text-xs font-medium text-muted">
            {envName ?? "…"}
          </span>
        )}
      </button>

      {lastDeployment && (
        <div className="ml-auto flex items-center gap-2 text-sm text-secondary">
          <DeploymentStatusBadge
            status={lastDeployment.status}
            variant="plain"
          />
          {appUrl && (
            <a
              href={appUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-hover/10"
            >
              <Globe size={12} /> {t("Open app")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
