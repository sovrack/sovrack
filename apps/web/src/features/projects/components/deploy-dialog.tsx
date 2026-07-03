"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Rocket,
} from "lucide-react";
import {
  DeployValidationPanel,
  DeployEnvironmentSelector,
  DeployServiceSelector,
} from "./deploy-dialog.parts";
import { Modal } from "@/shared/ui/modal";
import { Button } from "@/shared/ui/button";
import { deploymentsService, EnvVariablesPreview } from "@/features/deployments";
import { useDeployValidation } from "@/features/projects/api/use-deploy-validation";
import { getApiErrorMessage } from "@/shared/lib/api";
import {
  useProjectEnvironments,
  useProjectBranches,
} from "@/features/projects";
import { useToast } from "@/shared/contexts/toast-context";
import type { Environment } from "@/features/projects";
import type { Service } from "@/features/projects";
import type { BuildSource } from "@/features/deployments";

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  services?: Service[];
  initialServiceId?: string;
  initialEnvironmentId?: string;
  initialBranch?: string;
};

/** Map a service's buildPack to the BuildSource the backend expects. */
function resolveBuildSource(svc: Service | undefined): BuildSource {
  if (!svc) return "DOCKERFILE_LOCAL";
  if (svc.sourceType === "DOCKER_IMAGE") return "EXTERNAL_IMAGE";
  if (svc.type === "DATABASE") return "EXTERNAL_IMAGE";
  switch (svc.buildPack) {
    case "NIXPACKS":
      return "NIXPACKS_LOCAL";
    case "STATIC":
      return "STATIC";
    case "DOCKER_COMPOSE":
      return "DOCKER_COMPOSE";
    default:
      return "DOCKERFILE_LOCAL";
  }
}

export function DeployDialog({
  projectId,
  open,
  onClose,
  onCreated,
  services = [],
  initialServiceId,
  initialEnvironmentId,
  initialBranch,
}: Props) {
  const toast = useToast();

  // F-1 fix: use React Query hooks — cache shared with parent page, no double fetch.
  const envsQuery = useProjectEnvironments(projectId);
  const branchesQuery = useProjectBranches(projectId, open);

  const environments: Environment[] = useMemo(
    () => envsQuery.data ?? [],
    [envsQuery.data],
  );
  const branches = useMemo(
    () => branchesQuery.data ?? [],
    [branchesQuery.data],
  );
  const loading = envsQuery.isLoading || branchesQuery.isLoading;

  const [envIds, setEnvIds] = useState<string[]>([]);
  const [branch, setBranch] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState(
    initialServiceId ?? "",
  );

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const effectiveBuildSource: BuildSource = resolveBuildSource(selectedService);
  // D3: the service actually being validated (mirrors useDeployValidation's
  // own resolution) — used to link straight to its Build/Source config tab
  // when the backend reports a blocking preflight `reason`.
  const concernedService = selectedService ?? services[0];
  const serviceConfigHref = concernedService
    ? `/projects/${projectId}/services/${concernedService.id}`
    : undefined;

  const toggleEnvId = (id: string) =>
    setEnvIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const primaryEnvId = envIds[0] ?? "";
  const currentEnv = environments.find((e) => e.id === primaryEnvId);

  // Resolve the ServiceEnvironment to preview.
  const previewServiceEnvId = useMemo<string | null>(() => {
    const links = currentEnv?.serviceLinks ?? [];
    if (links.length === 0) return null;
    if (selectedServiceId) {
      return links.find((l) => l.serviceId === selectedServiceId)?.id ?? null;
    }
    return links[0]?.id ?? null;
  }, [currentEnv, selectedServiceId]);

  // Initialise selections whenever the dialog opens or data loads.
  useEffect(() => {
    if (!open || loading) return;
    if (initialServiceId) setSelectedServiceId(initialServiceId);

    if (initialBranch) {
      setBranch(initialBranch);
    } else if (initialServiceId && services.length > 0) {
      const svc = services.find((s) => s.id === initialServiceId);
      if (svc?.branch) setBranch(svc.branch);
    } else {
      const def = branches.find((b) => b.default);
      setBranch(def?.name ?? branches[0]?.name ?? "main");
    }

    if (
      initialEnvironmentId &&
      environments.some((e) => e.id === initialEnvironmentId)
    ) {
      setEnvIds([initialEnvironmentId]);
    } else if (envIds.length === 0 && environments.length > 0) {
      setEnvIds([environments[0].id]);
    }
    // Intentionally omit branches/services/environments/envIds from deps:
    // this effect is a one-shot initialiser that must run only when the dialog
    // opens or data first loads — not on every data change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading]);

  // Reset state when dialog closes.
  useEffect(() => {
    if (!open) {
      setError(null);
      setSuccess(false);
      setEnvIds([]);
    }
  }, [open]);

  // Pre-submission validation (client-side issues + server-side check) —
  // extracted into its own hook, see use-deploy-validation.ts.
  const { issues, validation, validating, validateError } = useDeployValidation({
    projectId,
    open,
    loading,
    services,
    selectedServiceId,
    environments,
    primaryEnvId,
    effectiveBuildSource,
  });

  const handleSubmit = async () => {
    if (envIds.length === 0) {
      setError("Select at least one environment.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const targets: { serviceEnvId: string; branch: string }[] = [];
      for (const eid of envIds) {
        const env = environments.find((e) => e.id === eid);
        if (!env) continue;
        const links = env.serviceLinks ?? [];
        if (selectedServiceId) {
          const link = links.find((l) => l.serviceId === selectedServiceId);
          if (link)
            targets.push({
              serviceEnvId: link.id,
              branch: branch || link.service.branch || "main",
            });
        } else {
          for (const link of links) {
            targets.push({
              serviceEnvId: link.id,
              branch: branch || link.service.branch || "main",
            });
          }
        }
      }
      if (targets.length === 0) {
        setError("No deployable services found for selected environments.");
        return;
      }
      const results = await Promise.allSettled(
        targets.map((t) =>
          deploymentsService.create({
            serviceEnvId: t.serviceEnvId,
            branch: t.branch,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        const reasons = failed
          .map((r) => getApiErrorMessage((r as PromiseRejectedResult).reason))
          .join("; ");
        const msg =
          failed.length === targets.length
            ? reasons
            : `Some deployments failed: ${reasons}`;
        setError(msg);
        toast(msg, "error");
      } else {
        setSuccess(true);
        toast("Deployment launched successfully!", "success");
        setTimeout(() => {
          onClose();
          onCreated();
        }, 800);
      }
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setError(msg);
      toast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const missing = validation?.missing ?? [];
  const ready = validation?.ready ?? true;
  const canDeploy =
    !loading &&
    !submitting &&
    envIds.length > 0 &&
    issues.length === 0 &&
    // `reason` (DeploymentPreflightService's precise rejection message) is a
    // deterministic, non-overridable block — unlike missing tools below,
    // there's no "Deploy anyway" for it: retrying without fixing the
    // underlying issue would just fail again on the real POST /deployments.
    // Before this fix, `(ready || missing.length === 0)` alone let a
    // reason-only failure (missing=[] but ready=false) through unnoticed,
    // since an empty `missing` array made the clause true regardless of
    // `ready` (AUDIT_VERIFICATION_UI.md Point 10).
    !validation?.reason &&
    (ready || missing.length === 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!submitting}
      title="Deploy"
      description="Launch a new deployment"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {missing.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => void handleSubmit()}
              disabled={!canDeploy}
            >
              Deploy anyway
            </Button>
          )}
          <Button
            onClick={() => void handleSubmit()}
            disabled={!canDeploy}
            loading={submitting}
            icon={submitting ? undefined : <Rocket size={14} />}
          >
            {submitting
              ? "Deploying…"
              : envIds.length > 1
                ? `Deploy to ${envIds.length} envs`
                : "Deploy"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Success */}
        {success && (
          <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            <CheckCircle2 size={16} /> Deployment launched! Redirecting to
            History…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* ════════ DEPLOY FORM ════════ */}
        <>
          <DeployValidationPanel
            issues={issues}
            loading={loading}
            envIds={envIds}
            validation={validation}
            validating={validating}
            validateError={validateError}
            onClose={onClose}
            serviceConfigHref={serviceConfigHref}
          />

          {!loading && (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-2.5 text-[11px] text-[var(--text-muted)]">
              Chaque service se construit avec son propre build — modifiez-le
              dans l&apos;onglet <strong>General</strong> du service.
            </p>
          )}

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2
                size={20}
                className="animate-spin text-[var(--text-muted)]"
              />
            </div>
          ) : (
            <>
              <DeployEnvironmentSelector
                environments={environments}
                envIds={envIds}
                projectId={projectId}
                onClose={onClose}
                toggleEnvId={toggleEnvId}
              />

              {/* Service (for GROUP sources) */}
              <DeployServiceSelector
                services={services}
                selectedServiceId={selectedServiceId}
                setSelectedServiceId={setSelectedServiceId}
                setBranch={setBranch}
              />

              {/* Branch */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  Branch
                </label>
                {branches.length > 0 ? (
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none"
                  >
                    {branches.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                        {b.default ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="main"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-3 font-mono text-sm text-[var(--text-primary)] outline-none"
                  />
                )}
              </div>
            </>
          )}
        </>

        {previewServiceEnvId ? (
          <EnvVariablesPreview serviceEnvId={previewServiceEnvId} />
        ) : null}
      </div>
    </Modal>
  );
}
