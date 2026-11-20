import { Badge } from "@/shared/ui/badge";
import type { ServerValidationResult } from "@/features/servers/types/server";

type Props = {
  results: ServerValidationResult[];
};

export function ServerValidationCard({ results }: Props) {
  const latest = results[0];

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-secondary">
            Validation
          </p>
          <h3 className="mt-1 text-lg font-semibold text-primary">
            SSH readiness
          </h3>
        </div>
        <Badge tone={latest?.sudoAvailable ? "success" : "warning"}>
          {latest?.sudoAvailable ? "sudo ready" : "needs validation"}
        </Badge>
      </div>

      {!latest ? (
        <p className="mt-4 text-sm text-secondary">
          No SSH validation has been persisted yet.
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-secondary">SSH reachable</dt>
            <dd className="font-semibold text-primary">
              {latest.sshReachable ? "Yes" : "No"}
            </dd>
          </div>
          <div>
            <dt className="text-secondary">Auth</dt>
            <dd className="font-semibold text-primary">
              {latest.authSucceeded ? "Succeeded" : "Failed"}
            </dd>
          </div>
          <div>
            <dt className="text-secondary">sudo -n true</dt>
            <dd className="font-semibold text-primary">
              {latest.sudoAvailable ? "Available" : "Missing"}
            </dd>
          </div>
          <div>
            <dt className="text-secondary">Python 3</dt>
            <dd className="font-semibold text-primary">
              {latest.pythonAvailable ? "Available" : "Missing"}
            </dd>
          </div>
          <div>
            <dt className="text-secondary">OS</dt>
            <dd className="font-semibold text-primary">
              {[latest.osName, latest.osVersion].filter(Boolean).join(" ") ||
                "Unknown"}
            </dd>
          </div>
          <div>
            <dt className="text-secondary">Architecture</dt>
            <dd className="font-semibold text-primary">
              {latest.architecture || "Unknown"}
            </dd>
          </div>
        </dl>
      )}

      {latest &&
        !latest.authSucceeded &&
        latest.validationMessage?.trim() && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {latest.validationMessage}
          </p>
        )}
    </div>
  );
}
