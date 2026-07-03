"use client";

import { Wrench } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import {
  usePreparationReadiness,
  useServerPreparationOptions,
} from "@/features/servers/api/use-servers";
import type {
  Server,
  ServerInstalledTool,
  StartServerPreparationPayload,
} from "@/features/servers/types/server";

export type PrepareOptions = StartServerPreparationPayload;

type OptionGroup = "Core" | "Runtime" | "Security" | "Operations";

// A5: the dropdown previously showed only the raw enum value (e.g. "WEB")
// with zero description anywhere — a user could only discover what a profile
// actually did by selecting it and visually diffing the checkbox grid below.
// These are purely presentational (a short name + one-line intent); the
// actual set of options each profile enables still comes entirely from the
// backend's PREPARATION_PROFILE_DEFAULTS (via profileDefaults, already
// fetched) — the dynamic summary below reads that real data, not this map.
const PROFILE_TAGLINES: Partial<Record<string, string>> = {
  BASIC: "Recommended baseline — hardening only, no runtime installed.",
  WEB: "Basic + Nginx/Certbot, for a server hosting a web app.",
  DATABASE: "Basic + PostgreSQL/Redis + backups, for a database server.",
  RUNNER: "Basic + Docker + GitLab Runner, for a CI/CD runner.",
  FULL: "Everything — web, database and runner tooling on one server.",
  CUSTOM: "Nothing pre-selected — pick each option yourself below.",
};

type ServerPrepareDialogProps = {
  open: boolean;
  server: Server | null;
  prepareOptions: PrepareOptions;
  isBusy: boolean;
  preparingId: string | null;
  installedTools?: ServerInstalledTool[];
  onClose: () => void;
  onFieldChange: (
    server: Server,
    field: keyof PrepareOptions,
    value: boolean | string,
  ) => void;
  onPrepare: (server: Server) => Promise<void>;
};

function resolveGroup(role: string | null): OptionGroup {
  if (!role || role === "system_base") return "Core";
  if (
    [
      "docker",
      "nginx",
      "nodejs",
      "postgres",
      "redis",
      "gitlab_runner",
    ].includes(role)
  ) {
    return "Runtime";
  }
  if (["firewall", "fail2ban", "ssl", "security_hardening"].includes(role)) {
    return "Security";
  }
  return "Operations";
}

export function ServerPrepareDialog({
  open,
  server,
  prepareOptions,
  isBusy,
  preparingId,
  onClose,
  onFieldChange,
  onPrepare,
}: ServerPrepareDialogProps) {
  const readinessQuery = usePreparationReadiness(
    open && server ? server.id : "",
  );
  const optionsQuery = useServerPreparationOptions();

  if (!server) return null;

  const readiness = readinessQuery.data;
  const readinessLoading =
    readinessQuery.isLoading || readinessQuery.isFetching;
  const readinessError = readinessQuery.error
    ? "Unable to check provisioning prerequisites right now."
    : null;
  const blockingReasons = readinessLoading
    ? ["Checking preparation prerequisites..."]
    : readinessError
      ? [readinessError]
      : (readiness?.blockingReasons ?? []);
  const isReady =
    !readinessLoading && !readinessError && Boolean(readiness?.isReady);

  const profiles = optionsQuery.data?.profiles ?? [];
  const options = optionsQuery.data?.options ?? [];
  const profile = prepareOptions.profile ?? "BASIC";
  const profileDefaultsForSelection =
    optionsQuery.data?.profileDefaults?.[profile] ?? {};
  const gitlabRunnerExecutor = prepareOptions.gitlabRunnerExecutor ?? "docker";
  const isOptionEnabled = (optionKey: string): boolean => {
    const explicit = prepareOptions[optionKey as keyof PrepareOptions];
    if (typeof explicit === "boolean") {
      return explicit;
    }
    return Boolean(
      profileDefaultsForSelection[
        optionKey as keyof typeof profileDefaultsForSelection
      ],
    );
  };
  const hasSelection = options.some((option) => isOptionEnabled(option.key));
  const groups: OptionGroup[] = ["Core", "Runtime", "Security", "Operations"];

  // A5: what THIS profile enables by default, derived straight from the
  // backend's real profileDefaults (already fetched) — not a hardcoded
  // frontend list, so it can never drift from what preparation actually runs.
  const profileEnabledLabels = options
    .filter(
      (option) =>
        profileDefaultsForSelection[
          option.key as keyof typeof profileDefaultsForSelection
        ],
    )
    .map((option) => option.label);

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!isBusy}
      size="xl"
      title="Choose preparation options"
      description={`${server.username}@${server.host}:${server.port}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button
            onClick={() => void onPrepare(server)}
            disabled={isBusy || !hasSelection || !isReady}
            loading={preparingId === server.id}
            icon={preparingId === server.id ? undefined : <Wrench size={14} />}
          >
            Run preparation
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          {optionsQuery.data?.message ??
            "Ansible runs from the backend control node. The target VPS remains an agentless SSH host and does not install Ansible."}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
              Profile
            </label>
            <select
              value={profile}
              onChange={(event) =>
                onFieldChange(server, "profile", event.target.value)
              }
              disabled={isBusy}
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
            >
              {profiles.length === 0 && (
                <option value={profile}>{profile}</option>
              )}
              {profiles.map((profileItem) => (
                <option key={profileItem} value={profileItem}>
                  {profileItem}
                  {PROFILE_TAGLINES[profileItem]
                    ? ` — ${PROFILE_TAGLINES[profileItem]}`
                    : ""}
                </option>
              ))}
            </select>
            {/* A5: dynamic summary of what THIS profile actually enables by
                default, computed from the real profileDefaults — not a
                static description that could drift from the backend. */}
            <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
              {profileEnabledLabels.length > 0
                ? `Enables by default: ${profileEnabledLabels.join(", ")}.`
                : "Nothing pre-selected — pick each option yourself below."}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3 text-xs text-[var(--text-secondary)]">
            <p className="font-semibold text-[var(--text-primary)]">
              Control-node execution
            </p>
            <p className="mt-1">
              All playbooks run from backend/control node. VPS are only SSH
              targets.
            </p>
          </div>
        </div>

        {optionsQuery.isLoading && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            Loading preparation options...
          </div>
        )}

        {optionsQuery.error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Unable to load preparation options from backend.
          </div>
        )}

        {groups.map((group) => {
          const groupOptions = options.filter(
            (option) => resolveGroup(option.role) === group,
          );
          if (groupOptions.length === 0) {
            return null;
          }
          return (
            <section key={group} className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {group}
                </h3>
                <Badge tone="default" size="sm">
                  {groupOptions.length} options
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groupOptions.map((option) => {
                  const checked = isOptionEnabled(option.key);
                  return (
                    <label
                      key={option.key}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3 transition hover:border-[var(--text-secondary)] hover:bg-[var(--bg-card)]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          onFieldChange(
                            server,
                            option.key as keyof PrepareOptions,
                            event.target.checked,
                          )
                        }
                        disabled={isBusy}
                        className="mt-1 accent-zinc-500"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {option.label}
                        </span>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {option.description}
                        </p>
                        {option.dependencies.length > 0 && (
                          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                            Depends on: {option.dependencies.join(", ")}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}

        {Boolean(prepareOptions.gitlabRunner) && (
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
              GitLab Runner executor
            </label>
            <select
              value={gitlabRunnerExecutor}
              onChange={(event) =>
                onFieldChange(
                  server,
                  "gitlabRunnerExecutor",
                  event.target.value,
                )
              }
              disabled={isBusy}
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
            >
              <option value="docker">docker</option>
              <option value="shell">shell</option>
            </select>
          </div>
        )}

        {!hasSelection && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
            Select at least one preparation option.
          </div>
        )}

        {!isReady && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <p className="font-semibold">Preparation blocked</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {blockingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
