"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { projectsService } from "@/features/projects/api/projects.service";
import { useI18n } from "@/shared/i18n/language-context";
import { getApiErrorMessage } from "@/shared/lib/api";
import { timeAgo } from "@/features/deployments/utils";

const STATUS_TONE: Record<string, string> = {
  success: "text-green-400 border-green-500/30 bg-green-500/10",
  failed: "text-red-400 border-red-500/30 bg-red-500/10",
  running: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  pending: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  canceled: "text-zinc-400 border-zinc-500/30 bg-zinc-500/10",
};

/**
 * Onglet Pipelines d'un service : l'historique CI du dépôt (GitLab pipelines /
 * GitHub Actions), filtré sur la branche du service. Chaque ligne ouvre le
 * pipeline chez le provider (web_url).
 */
export function ServicePipelines({
  projectId,
  serviceId,
  branch,
}: {
  projectId: string;
  serviceId?: string;
  branch?: string | null;
}) {
  const { t } = useI18n();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["service-pipelines", projectId, serviceId ?? "project"],
    // Au niveau service : dépôt propre au service ; sinon vue projet.
    queryFn: () =>
      serviceId
        ? projectsService.getServicePipelines(projectId, serviceId)
        : projectsService.getPipelines(projectId),
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
  });

  const all = data ?? [];
  const pipelines = branch ? all.filter((p) => p.ref === branch) : all;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {t("Pipelines (CI/CD)")}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            {t("CI history of the repository")}
            {branch ? ` (${t("branch")} ${branch})` : ""}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <XCircle size={14} /> {getApiErrorMessage(error)}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-8 text-sm text-[var(--text-secondary)]">
          <Loader2 size={14} className="animate-spin" />{" "}
          {t("Loading pipelines…")}
        </div>
      )}

      {!isLoading && !error && pipelines.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-14 text-center">
          <CheckCircle2 size={26} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {t("No pipelines")}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {t(
              "CI pipelines will appear here as soon as the repository triggers one.",
            )}
          </p>
        </div>
      )}

      {pipelines.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
          {pipelines.map((p, i) => (
            <div
              key={p.id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 ${i !== 0 ? "border-t border-[var(--border)]" : ""}`}
            >
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[p.status] ?? "text-zinc-400 border-zinc-500/30 bg-zinc-500/10"}`}
              >
                {p.status}
              </span>
              <span className="flex items-center gap-1 font-mono text-xs text-[var(--text-primary)]">
                <GitBranch size={11} /> {p.ref}
              </span>
              {p.sha && (
                <span className="font-mono text-xs text-[var(--text-muted)]">
                  {p.sha.slice(0, 7)}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <Clock size={10} /> {timeAgo(p.created_at)}
              </span>
              {p.web_url && (
                <a
                  href={p.web_url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                >
                  {t("Open")} <ExternalLink size={11} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
