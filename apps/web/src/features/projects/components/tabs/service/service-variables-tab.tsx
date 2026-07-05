"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";
import { environmentsService } from "@/features/projects/api/environments.service";
import { useResolvedServiceEnvId } from "@/features/projects/api/use-resolved-service-env-id";
import { useProjectServices } from "@/features/projects/api/use-project-services";
import { getApiErrorMessage } from "@/shared/lib/api";
import { SectionCard } from "@/shared/layout/section-card";
import {
  EnvTextEditor,
  KvRows,
  kvFromRaw,
  kvToEnvText,
  kvToJson,
  parseEnvText,
  type KV,
} from "./service-variables-tab.parts";

/**
 * B4: replaces the old "Environments" tab (PRODUCTION/STAGING rows, each with
 * a chevron to expand its own variables editor) — redundant with the
 * environment selector already in the service page header (the same one
 * driving Containers/Metrics/Logs). This tab shows the editor DIRECTLY for
 * whichever environment the header selector points at — no intermediate
 * click needed to reach it.
 */
export function ServiceVariablesTab({
  projectId,
  serviceId,
  environmentId,
  serviceEnvId,
}: {
  projectId: string;
  serviceId: string;
  environmentId: string;
  serviceEnvId: string | null;
}) {
  // Filet de sécurité préservé de l'ancien onglet : un service hérité (créé
  // avant l'auto-link service↔environnement) peut ne pas encore avoir de
  // ServiceEnvironment pour CET environnement — on le crée à la volée
  // (upsert) plutôt que d'afficher un faux "no environment" alors que
  // l'environnement, lui, existe bien. Partagé avec ServiceConfigForm's
  // Auto-deploy control (Task 1, "Correction rapide") via ce hook commun.
  const { resolvedServiceEnvId, linking, linkError } = useResolvedServiceEnvId(
    projectId,
    serviceId,
    environmentId,
    serviceEnvId,
  );

  // "Correction complète" mission, Task 4 point 5: sibling DATABASE services
  // of this SAME project, linked to this SAME environment, already get
  // DATABASE_URL/REDIS_URL injected automatically at deploy time
  // (deployment-env.service.ts::resolveAutoWiredDbEnv) — with zero manual
  // configuration. Surfaced here so a user doesn't assume they need to type
  // these in by hand (this mechanism was previously invisible in the UI).
  const servicesQuery = useProjectServices(projectId);
  const autoWiredDbs = (servicesQuery.data ?? [])
    .filter(
      (s) =>
        s.type === "DATABASE" &&
        s.id !== serviceId &&
        s.envLinks?.some((l) => l.environmentId === environmentId),
    )
    .map((s) => ({
      name: s.name,
      envVar: s.databaseType === "REDIS" ? "REDIS_URL" : "DATABASE_URL",
    }));

  if (!environmentId) {
    return (
      <SectionCard
        title="Variables"
        description="Environment variables and secrets for this service."
      >
        <p className="text-sm text-[var(--text-secondary)]">
          No environment — create one in the project&apos;s{" "}
          <Link
            href={`/projects/${projectId}?openEnvironments=true`}
            className="underline hover:text-[var(--text-primary)]"
          >
            Environments
          </Link>{" "}
          tab.
        </p>
      </SectionCard>
    );
  }

  if (!resolvedServiceEnvId) {
    return (
      <SectionCard
        title="Variables"
        description="Environment variables and secrets for this service."
      >
        {linkError && <p className="mb-2 text-xs text-red-400">{linkError}</p>}
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          {linking && <Loader2 size={14} className="animate-spin" />}
          {linking ? "Linking this service to the environment…" : "Unable to load variables for this environment."}
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Variables"
      description="Environment variables and secrets for this service, for the environment selected above."
    >
      {autoWiredDbs.length > 0 && (
        <div className="mb-3 space-y-1 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
          {autoWiredDbs.map((db) => (
            <p key={db.name}>
              <span className="font-mono font-semibold">{db.envVar}</span> is
              injected automatically from the{" "}
              <span className="font-mono">{db.name}</span> service of this
              project — no manual configuration needed.
            </p>
          ))}
        </div>
      )}
      <EnvVarsEditor projectId={projectId} serviceEnvId={resolvedServiceEnvId} />
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    environmentsService
      .getServiceLink(projectId, serviceEnvId)
      .then((se) => {
        if (!alive) return;
        setVarsText(kvToEnvText(kvFromRaw(se.env as unknown)));
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
    setSaving(true);
    try {
      const payload: {
        env?: string;
        secretsEnv?: string;
      } = {
        env: kvToJson(parseEnvText(varsText).valid),
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

  if (loading) {
    return <p className="text-xs text-[var(--text-muted)]">Loading…</p>;
  }

  return (
    <div className="space-y-3">
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
        <label className={lbl}>Secrets (encrypted at rest · write-only)</label>
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
          <span className="text-xs text-[var(--text-secondary)]">{msg}</span>
        )}
      </div>
    </div>
  );
}
