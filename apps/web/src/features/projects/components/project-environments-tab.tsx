"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Server,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { environmentsService } from "@/features/projects/api/environments.service";
import { useProjectEnvironments } from "@/features/projects/api/use-project-environments";
import { projectKeys } from "@/features/projects/api/project-query-keys";
import { getApiErrorMessage } from "@/shared/lib/api";
import { useConfirm } from "@/shared/contexts/confirm-context";
import { useServers } from "@/features/servers";
import { Modal } from "@/shared/ui/modal";
import { Button } from "@/shared/ui/button";
import { ENV_BADGE } from "@/features/deployments/utils";
import type { EnvName } from "@/features/projects/types/environment";

const ENV_NAMES: EnvName[] = ["STAGING", "PRODUCTION", "TESTING", "PREVIEW"];

const SERVICE_TYPE_STYLE: Record<string, string> = {
  APPLICATION: "bg-accent/10 text-accent",
  DATABASE: "bg-accent/10 text-accent",
  MANAGED: "bg-accent/10 text-accent",
};

function AddEnvDialog({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [envName, setEnvName] = useState<EnvName>("STAGING");
  const [serverIds, setServerIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serversQuery = useServers();
  const servers = serversQuery.data ?? [];

  const toggleServer = (id: string) =>
    setServerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      // An environment targets one or more VPS — create it, then attach the
      // selected server(s). The backend automatically links all existing services
      // to this new environment (EnvironmentsService.create → linkServiceToAllEnvsForEnvironment).
      const env = await environmentsService.create(projectId, {
        name: envName,
      });
      for (const serverId of serverIds) {
        await environmentsService.assignServer(projectId, env.id, serverId);
      }
      onCreated();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissable={!saving}
      title="Add an environment"
      description="Create a deployment environment."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleCreate()}
            loading={saving}
            icon={saving ? undefined : <Plus size={13} />}
          >
            {saving ? "Creating…" : "Create"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            {error}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Environment type
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ENV_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setEnvName(name)}
                className={clsx(
                  "rounded-lg border px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wide transition",
                  envName === name
                    ? "border-accent bg-hover/10 text-primary"
                    : "border-border text-muted hover:bg-hover/10",
                )}
              >
                <span
                  className={clsx(
                    "block rounded-md border px-2 py-0.5 text-[10px]",
                    ENV_BADGE[name] ?? "",
                  )}
                >
                  {name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Target VPS
          </p>
          {servers.length === 0 ? (
            <p className="rounded-lg border border-border bg-hover/10 px-3 py-2 text-xs text-muted">
              No servers yet — add one in Remote Servers, then attach it here.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {servers.map((s) => {
                const selected = serverIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleServer(s.id)}
                    className={clsx(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition",
                      selected
                        ? "border-accent/30 bg-accent/10 text-primary"
                        : "border-border text-muted hover:bg-hover/10",
                    )}
                  >
                    {selected ? (
                      <CheckCircle2 size={13} />
                    ) : (
                      <Server size={13} />
                    )}
                    <span className="flex-1 truncate">{s.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted">
                      {s.status}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

type Props = {
  projectId: string;
  onChanged?: () => void;
  onDeploy?: (envId?: string) => void;
  compact?: boolean;
};

export function ProjectEnvironmentsTab({
  projectId,
  onChanged,
  onDeploy,
  compact = false,
}: Props) {
  const envsQuery = useProjectEnvironments(projectId);
  const queryClient = useQueryClient();
  const environments = envsQuery.data ?? [];
  const loading = envsQuery.isLoading;
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const error =
    actionError ??
    (envsQuery.error ? getApiErrorMessage(envsQuery.error) : null);
  const confirm = useConfirm();

  const load = () =>
    queryClient.invalidateQueries({
      queryKey: projectKeys.environments(projectId),
    });

  const handleDelete = async (envId: string) => {
    if (
      !(await confirm({
        title: "Delete this environment?",
        confirmLabel: "Delete",
        variant: "danger",
      }))
    )
      return;
    setDeletingId(envId);
    setActionError(null);
    try {
      await environmentsService.remove(projectId, envId);
      await load();
      onChanged?.();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-secondary">
        <Loader2 size={14} className="animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">
            {environments.length} environnement
            {environments.length !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-secondary transition hover:text-primary"
            >
              <RefreshCw size={12} /> Refresh
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition hover:bg-accent-hover"
            >
              <Plus size={12} /> Add
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {environments.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
            <Server size={28} className="mb-3 text-muted" />
            <p className="text-sm font-semibold text-primary">
              No environment
            </p>
            <p className="mt-1 max-w-xs text-xs text-secondary">
              Add a STAGING or PRODUCTION environment to be able to deploy.
            </p>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover"
            >
              <Plus size={14} /> Add an environment
            </button>
          </div>
        )}

        {environments.map((env) => {
          const envServices = env.serviceLinks ?? [];
          return (
            <div
              key={env.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={clsx(
                      "rounded-md border px-2.5 py-0.5 text-xs font-bold uppercase",
                      ENV_BADGE[env.name] ??
                        "border-border bg-hover/10 text-secondary",
                    )}
                  >
                    {env.name}
                  </span>
                  {env.name === "PREVIEW" && (
                    <span className="rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
                      Éphémère PR / MR
                    </span>
                  )}
                  {/* Serveur lié — sinon avertissement (les déploiements échoueraient). */}
                  {(env.servers?.length ?? 0) > 0 ? (
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <Server size={11} />{" "}
                      {env.servers!.map((s) => s.name).join(", ")}
                    </span>
                  ) : (
                    <span
                      className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400"
                      title="Link a server (active and verified) to be able to deploy."
                    >
                      <AlertTriangle size={11} /> No server linked
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!compact && onDeploy && (
                    <button
                      type="button"
                      onClick={() => onDeploy(env.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground transition hover:bg-accent-hover"
                    >
                      <Rocket size={11} /> Deploy
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDelete(env.id)}
                    disabled={deletingId === env.id}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                    title="Delete"
                  >
                    {deletingId === env.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                </div>
              </div>

              {envServices.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  {envServices.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center gap-1.5 rounded-lg border border-green-500/20 bg-green-500/8 px-2.5 py-1 text-xs"
                    >
                      <CheckCircle2 size={10} className="text-green-400" />
                      <span className="font-semibold text-primary">
                        {link.service?.name ?? "?"}
                      </span>
                      {link.service?.type && (
                        <span
                          className={clsx(
                            "rounded px-1 py-0.5 text-[9px] font-semibold uppercase",
                            SERVICE_TYPE_STYLE[link.service.type] ?? "",
                          )}
                        >
                          {link.service.type}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {envServices.length === 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  <Globe size={12} />
                  No services in this environment.
                </div>
              )}
            </div>
          );
        })}

        {addOpen && (
          <AddEnvDialog
            projectId={projectId}
            onClose={() => setAddOpen(false)}
            onCreated={() => {
              setAddOpen(false);
              void load();
              onChanged?.();
            }}
          />
        )}
      </div>
    </div>
  );
}
