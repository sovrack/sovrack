"use client";

import { useState } from "react";
import { AlertTriangle, Eye, EyeOff, Variable } from "lucide-react";
import { useEnvPreview } from "@/features/deployments/api/use-env-preview";
import { getApiErrorMessage } from "@/shared/lib/api";
import type { EnvOrigin } from "@/features/deployments/types";

const ORIGIN_META: Record<EnvOrigin, { label: string; className: string }> = {
  service: {
    label: "service",
    className: "text-accent border-accent/30 bg-accent/10",
  },
  environment: {
    label: "environment",
    className: "text-accent border-accent/30 bg-accent/10",
  },
  serviceEnvironment: {
    label: "serviceEnv",
    className: "text-accent border-accent/30 bg-accent/10",
  },
};

/**
 * Preview of the variables that WILL be injected into the container for a given
 * ServiceEnvironment, before confirming a deploy. Secrets are masked with a
 * per-row toggle; resolution warnings (malformed JSON at a level) are surfaced.
 */
export function EnvVariablesPreview({
  serviceEnvId,
}: {
  serviceEnvId: string | null;
}) {
  const query = useEnvPreview(serviceEnvId);
  const data = query.data ?? null;
  const loading = query.isLoading;
  const error = query.error ? getApiErrorMessage(query.error) : null;
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  if (!serviceEnvId) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-secondary">
        <Variable size={13} />
        Injected variables
        {data ? (
          <span className="text-muted">
            ({data.variables.length})
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted">
          Loading variables…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          {error}
        </div>
      ) : null}

      {data && data.warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          <AlertTriangle size={13} className="mr-1 inline" />
          Some variables could not be resolved. Check the configuration before
          deploying.
          <ul className="mt-1 list-disc pl-5">
            {data.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {data && data.variables.length > 0 ? (
        <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-card text-muted">
              <tr>
                <th className="px-3 py-1.5 font-medium">Nom</th>
                <th className="px-3 py-1.5 font-medium">Valeur</th>
                <th className="px-3 py-1.5 font-medium">Origine</th>
              </tr>
            </thead>
            <tbody>
              {data.variables.map((v) => {
                const origin = ORIGIN_META[v.origin];
                const show = revealed[v.key];
                return (
                  <tr key={v.key} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono text-primary">
                      {v.key}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-secondary">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">
                          {v.isSecret && !show ? "••••••••" : v.value}
                        </span>
                        {v.isSecret ? (
                          <button
                            type="button"
                            aria-label={show ? "Masquer" : "Afficher"}
                            onClick={() =>
                              setRevealed((prev) => ({
                                ...prev,
                                [v.key]: !prev[v.key],
                              }))
                            }
                            className="text-muted hover:text-primary"
                          >
                            {show ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] ${origin.className}`}
                      >
                        {origin.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && data.variables.length === 0 && !loading ? (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted">
          No variables configured.
        </div>
      ) : null}
    </div>
  );
}
