"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Layers, Loader2, Save } from "lucide-react";
import { environmentsService } from "@/features/projects/api/environments.service";
import { getApiErrorMessage } from "@/shared/lib/api";
import { SectionCard } from "@/shared/layout/section-card";
import {
  BUILD_PACKS,
  EnvTextEditor,
  KvRows,
  kvFromRaw,
  kvToEnvText,
  kvToJson,
  parseEnvText,
  type KV,
  type ServiceDefaults,
} from "./service-environments.parts";

/**
 * Onglet Environments d'un service : un service tourne dans TOUS les
 * environnements du projet (le lien service↔env est auto-créé à la création du
 * service et à la création d'un environnement). Il n'y a donc plus d'attach /
 * detach : on liste tous les environnements et on édite les variables/secrets
 * propres à chaque instance. Le choix de l'environnement se fait au déploiement.
 *
 * Filet de sécurité : pour un service hérité (créé avant l'auto-link) dont le
 * lien manque sur un environnement, on crée le lien à la volée via l'upsert
 * existant (`linkService`) au moment d'ouvrir ses variables.
 */
export function ServiceEnvironments({
  projectId,
  serviceId,
  environments,
  envLinks,
  onChanged,
}: {
  projectId: string;
  serviceId: string;
  environments: { id: string; name: string }[];
  envLinks: { id: string; environmentId: string }[];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null); // serviceEnvId déplié

  const linkFor = (envId: string) =>
    envLinks.find((l) => l.environmentId === envId) ?? null;

  // Ouvre/ferme l'éditeur de variables d'un environnement. Si le lien n'existe
  // pas encore (service hérité), on le crée à la volée (upsert) puis on l'ouvre.
  const openEnv = async (envId: string) => {
    const link = linkFor(envId);
    if (link) {
      setOpenId((prev) => (prev === link.id ? null : link.id));
      return;
    }
    setBusyId(envId);
    setError(null);
    try {
      await environmentsService.linkService(projectId, envId, serviceId);
      const links = await environmentsService.getServiceLinks(projectId, envId);
      const created = links.find((l) => l.serviceId === serviceId) ?? null;
      onChanged();
      if (created) setOpenId(created.id);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SectionCard
      title="Environments & variables"
      description="This service runs in every project environment. Each environment has ITS OWN variables — pick the target environment when you deploy."
    >
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      {environments.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No environment — create one in the project&apos;s{" "}
          <Link
            href={`/projects/${projectId}?openEnvironments=true`}
            className="underline hover:text-[var(--text-primary)]"
          >
            Environments
          </Link>{" "}
          tab.
        </p>
      ) : (
        <div className="space-y-2">
          {environments.map((env) => {
            const link = linkFor(env.id);
            const busy = busyId === env.id;
            const isOpen = !!link && openId === link.id;
            return (
              <div
                key={env.id}
                className="overflow-hidden rounded-lg border border-[var(--border)]"
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <Layers size={14} className="text-[var(--text-muted)]" />
                    <span className="font-medium text-[var(--text-primary)]">
                      {env.name}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void openEnv(env.id)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <ChevronDown
                        size={12}
                        className={
                          isOpen ? "rotate-180 transition" : "transition"
                        }
                      />
                    )}{" "}
                    Variables
                  </button>
                </div>
                {isOpen && link && (
                  <EnvVarsEditor projectId={projectId} serviceEnvId={link.id} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function EnvVarsEditor({
  projectId,
  serviceEnvId,
}: {
  projectId: string;
  serviceEnvId: string;
}) {
  const [varsText, setVarsText] = useState("");
  const [secrets, setSecrets] = useState<KV[]>([]);
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [autoBranch, setAutoBranch] = useState("main");
  // C6: the 5 per-environment overrides — empty string means "inherit from
  // the parent Service" (shown via the placeholder below).
  const [branch, setBranch] = useState("");
  const [port, setPort] = useState("");
  const [startCommand, setStartCommand] = useState("");
  const [healthcheckPath, setHealthcheckPath] = useState("");
  const [buildPack, setBuildPack] = useState("");
  const [serviceDefaults, setServiceDefaults] = useState<ServiceDefaults | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    environmentsService
      .getServiceLink(projectId, serviceEnvId)
      .then((se) => {
        if (!alive) return;
        setVarsText(kvToEnvText(kvFromRaw(se.env as unknown)));
        setAutoDeploy(!!se.autoDeploy);
        setAutoBranch(se.autoBranch ?? "main");
        setBranch(se.branch ?? "");
        setPort(se.port != null ? String(se.port) : "");
        setStartCommand(se.startCommand ?? "");
        setHealthcheckPath(se.healthcheckPath ?? "");
        setBuildPack(se.buildPack ?? "");
        setServiceDefaults({
          branch: se.service.branch ?? null,
          port: se.service.port ?? null,
          startCommand: se.service.startCommand ?? null,
          healthcheckPath: se.service.healthcheckPath ?? null,
          buildPack: se.service.buildPack ?? null,
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId, serviceEnvId]);

  const save = async () => {
    setMsg(null);
    if (port.trim() && !Number.isInteger(Number(port.trim()))) {
      setMsg("Port must be a whole number.");
      return;
    }
    setSaving(true);
    try {
      const payload: {
        env?: string;
        secretsEnv?: string;
        autoDeploy?: boolean;
        autoBranch?: string;
        branch?: string | null;
        port?: number | null;
        startCommand?: string | null;
        healthcheckPath?: string | null;
        buildPack?: string | null;
      } = {
        autoDeploy,
        autoBranch: autoBranch.trim() || "main",
        env: kvToJson(parseEnvText(varsText).valid),
        branch: branch.trim() || null,
        port: port.trim() ? Number(port.trim()) : null,
        startCommand: startCommand.trim() || null,
        healthcheckPath: healthcheckPath.trim() || null,
        buildPack: buildPack || null,
      };
      const secretRows = secrets.filter((s) => s.key.trim());
      if (secretRows.length) payload.secretsEnv = kvToJson(secretRows);
      await environmentsService.updateServiceLink(
        projectId,
        serviceEnvId,
        payload,
      );
      setMsg("Saved ✓");
      setSecrets([]);
    } catch (e) {
      setMsg(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const lbl =
    "mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";
  const overrideInputCls =
    "w-full rounded-md border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]/60 focus:border-[var(--text-muted)]";

  return (
    <div className="space-y-3 border-t border-[var(--border)] bg-[var(--bg-app)]/40 px-3 py-3">
      {loading ? (
        <p className="text-xs text-[var(--text-muted)]">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
            <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={autoDeploy}
                onChange={(e) => setAutoDeploy(e.target.checked)}
              />
              Auto-deploy on push
            </label>
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              branch
              <input
                value={autoBranch}
                onChange={(e) => setAutoBranch(e.target.value)}
                placeholder="main"
                disabled={!autoDeploy}
                className="w-32 rounded-md border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none disabled:opacity-50"
              />
            </span>
          </div>

          <div>
            <label className={lbl}>
              Overrides for this environment
              <span className="ml-1 normal-case text-[var(--text-muted)]/70">
                (leave a field empty to use the service&apos;s own value)
              </span>
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-[10px] text-[var(--text-muted)]">
                  Branch
                </span>
                <input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder={serviceDefaults?.branch ?? "main"}
                  className={overrideInputCls}
                />
              </div>
              <div>
                <span className="mb-1 block text-[10px] text-[var(--text-muted)]">
                  Port
                </span>
                <input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder={
                    serviceDefaults?.port != null
                      ? String(serviceDefaults.port)
                      : "3000"
                  }
                  className={overrideInputCls}
                />
              </div>
              <div>
                <span className="mb-1 block text-[10px] text-[var(--text-muted)]">
                  Start command
                </span>
                <input
                  value={startCommand}
                  onChange={(e) => setStartCommand(e.target.value)}
                  placeholder={serviceDefaults?.startCommand ?? "—"}
                  className={overrideInputCls}
                />
              </div>
              <div>
                <span className="mb-1 block text-[10px] text-[var(--text-muted)]">
                  Healthcheck path
                </span>
                <input
                  value={healthcheckPath}
                  onChange={(e) => setHealthcheckPath(e.target.value)}
                  placeholder={serviceDefaults?.healthcheckPath ?? "—"}
                  className={overrideInputCls}
                />
              </div>
              <div className="sm:col-span-2">
                <span className="mb-1 block text-[10px] text-[var(--text-muted)]">
                  Build pack
                </span>
                <select
                  value={buildPack}
                  onChange={(e) => setBuildPack(e.target.value)}
                  className={overrideInputCls}
                >
                  <option value="">
                    Use service default
                    {serviceDefaults?.buildPack
                      ? ` (${serviceDefaults.buildPack})`
                      : ""}
                  </option>
                  {BUILD_PACKS.map((bp) => (
                    <option key={bp} value={bp}>
                      {bp}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className={lbl}>
              Variables{" "}
              <span className="normal-case text-[var(--text-muted)]/70">
                (.env format — NAME=value, one per line)
              </span>
            </label>
            <EnvTextEditor text={varsText} setText={setVarsText} />
          </div>
          <div>
            <label className={lbl}>
              Secrets (encrypted at rest · write-only)
            </label>
            <KvRows rows={secrets} setRows={setSecrets} secret />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Leave empty to keep the existing secrets.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Save size={12} />
              )}{" "}
              Save
            </button>
            {msg && (
              <span className="text-xs text-[var(--text-secondary)]">
                {msg}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
