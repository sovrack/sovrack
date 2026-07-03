"use client";

import { AlertTriangle, CheckCircle2, Layers, Loader2 } from "lucide-react";
import Link from "next/link";
import type { DeployValidationResult } from "@/features/deployments";
import type { Environment, Service } from "@/features/projects";

/* ─── ValidationIssue type (shared with deploy-dialog.tsx) ─────────────── */

export type ValidationIssue = {
  type: "no-source" | "no-build-config" | "no-environment" | "no-branch";
  message: string;
  href: string;
};

/* ─── DeployValidationPanel ─────────────────────────────────────────────── */

type DeployValidationPanelProps = {
  issues: ValidationIssue[];
  loading: boolean;
  envIds: string[];
  validation: DeployValidationResult | null;
  validating: boolean;
  validateError: string | null;
  onClose: () => void;
};

export function DeployValidationPanel({
  issues, loading, envIds,
  validation, validating, validateError,
  onClose,
}: DeployValidationPanelProps) {
  const missing = validation?.missing ?? [];
  const isPrepared = validation?.prepared ?? false;

  return (
    <>
      {issues.length > 0 && !loading && (
        <div className="space-y-2">
          {issues.map((issue, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0 text-amber-400" />
                <span className="text-xs text-amber-300">{issue.message}</span>
              </div>
              <Link
                href={issue.href}
                onClick={onClose}
                className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/20 px-2.5 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/30"
              >
                Configure →
              </Link>
            </div>
          ))}
        </div>
      )}

      {!loading && envIds.length > 0 && (
        <div className="space-y-2">
          {validating && (
            <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-xs text-blue-300">
              <Loader2 size={14} className="animate-spin" />
              Checking server tools…
            </div>
          )}
          {validateError && !validating && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
              Validation error: {validateError}
            </div>
          )}
          {validation && !validating && !isPrepared && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                  <AlertTriangle size={14} />
                  Server not prepared yet on {validation.serverName}
                </div>
                {validation.serverId && (
                  <Link
                    href={`/admin/servers/${validation.serverId}`}
                    onClick={onClose}
                    className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/20 px-2.5 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/30"
                  >
                    Install tools →
                  </Link>
                )}
              </div>
              <div className="mt-2 space-y-1.5">
                {validation.required.map((req) => {
                  const isMissing = missing.some((m) => m.binary === req.binary);
                  return (
                    <div key={req.binary} className="flex items-center gap-2 text-xs">
                      {isMissing ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500/20 text-[10px] text-red-400">✕</span>
                      ) : (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500/20 text-[10px] text-green-400">✓</span>
                      )}
                      <span className={isMissing ? "text-red-300" : "text-green-300"}>
                        {req.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {validation && !validating && isPrepared && missing.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                  <AlertTriangle size={14} />
                  Missing tools on {validation.serverName}
                </div>
                {validation.serverId && (
                  <Link
                    href={`/admin/servers/${validation.serverId}`}
                    onClick={onClose}
                    className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/20 px-2.5 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/30"
                  >
                    Install tools →
                  </Link>
                )}
              </div>
              <div className="mt-2 space-y-1.5">
                {validation.required.map((req) => {
                  const isMissing = missing.some((m) => m.binary === req.binary);
                  return (
                    <div key={req.binary} className="flex items-center gap-2 text-xs">
                      {isMissing ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500/20 text-[10px] text-red-400">✕</span>
                      ) : (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500/20 text-[10px] text-green-400">✓</span>
                      )}
                      <span className={isMissing ? "text-red-300" : "text-green-300"}>
                        {req.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {validation && !validating && isPrepared && missing.length === 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-xs text-green-400">
              <CheckCircle2 size={14} />
              All required tools are installed on {validation.serverName}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ─── DeployEnvironmentSelector ─────────────────────────────────────────── */

type DeployEnvironmentSelectorProps = {
  environments: Environment[];
  envIds: string[];
  projectId: string;
  onClose: () => void;
  toggleEnvId: (id: string) => void;
};

export function DeployEnvironmentSelector({
  environments, envIds, projectId, onClose, toggleEnvId,
}: DeployEnvironmentSelectorProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        Environment{" "}
        <span className="font-normal normal-case text-[var(--text-muted)]">(select one or more)</span>
      </label>
      {environments.length === 0 ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-xs text-amber-300">
          No environments. Create one in{" "}
          <Link
            href={`/projects/${projectId}?openEnvironments=true`}
            onClick={onClose}
            className="font-semibold underline"
          >
            Environments
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {environments.map((env) => {
            const selected = envIds.includes(env.id);
            return (
              <button
                key={env.id}
                type="button"
                onClick={() => toggleEnvId(env.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                  selected
                    ? "border-[var(--text-primary)]/30 bg-[var(--text-primary)]/10 text-[var(--text-primary)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {selected ? (
                  <CheckCircle2 size={12} />
                ) : (
                  <span className="h-3 w-3 rounded-full border border-current opacity-40" />
                )}
                {env.name}
              </button>
            );
          })}
        </div>
      )}
      {envIds.length > 1 && (
        <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
          {envIds.length} environments selected — one deployment per environment will be created.
        </p>
      )}
    </div>
  );
}

/* ─── DeployServiceSelector ─────────────────────────────────────────────── */

type DeployServiceSelectorProps = {
  services: Service[];
  selectedServiceId: string;
  setSelectedServiceId: (id: string) => void;
  setBranch: (b: string) => void;
};

export function DeployServiceSelector({
  services, selectedServiceId, setSelectedServiceId, setBranch,
}: DeployServiceSelectorProps) {
  if (services.length === 0) return null;
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        Service
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedServiceId("")}
          className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
            selectedServiceId === ""
              ? "border-[var(--text-primary)]/30 bg-[var(--text-primary)]/10 text-[var(--text-primary)]"
              : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Layers size={12} className="mr-1.5 inline" />
          All services
        </button>
        {services.map((svc) => (
          <button
            key={svc.id}
            type="button"
            onClick={() => {
              setSelectedServiceId(svc.id);
              setBranch(svc.branch ?? "main");
            }}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
              selectedServiceId === svc.id
                ? "border-[var(--text-primary)]/30 bg-[var(--text-primary)]/10 text-[var(--text-primary)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {svc.name}
            {selectedServiceId === svc.id && (
              <CheckCircle2 size={12} className="ml-1.5 inline" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
