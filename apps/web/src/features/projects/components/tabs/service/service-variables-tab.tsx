"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";
import { environmentsService } from "@/features/projects/api/environments.service";
import { useResolvedServiceEnvId } from "@/features/projects/api/use-resolved-service-env-id";
import { useProjectServices } from "@/features/projects/api/use-project-services";
import { useServiceCredentials } from "@/features/projects/api/use-service-credentials";
import { getApiErrorMessage } from "@/shared/lib/api";
import { SectionCard } from "@/shared/layout/section-card";
import { CredentialField } from "./credential-field";
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
      id: s.id,
      name: s.name,
      envVar:
        s.databaseType === "REDIS"
          ? "REDIS_URL"
          : s.databaseType === "RABBITMQ"
            ? "AMQP_URL"
            : "DATABASE_URL",
    }));

  if (!environmentId) {
    return (
      <SectionCard
        title="Variables"
        description="Environment variables and secrets for this service."
      >
        <p className="text-sm text-secondary">
          No environment — create one in the project&apos;s{" "}
          <Link
            href={`/projects/${projectId}?openEnvironments=true`}
            className="underline hover:text-primary"
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
        <p className="flex items-center gap-2 text-sm text-secondary">
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
        <div className="mb-3 space-y-2 rounded-lg border border-accent/20 bg-accent/10 px-3 py-2.5">
          <p className="text-xs text-accent">
            {autoWiredDbs.length > 1
              ? "These connection variables are "
              : "This connection variable is "}
            <span className="font-semibold">auto-injected</span> from this
            project&apos;s database service
            {autoWiredDbs.length > 1 ? "s" : ""} at deploy time — override any of
            them by redefining the same key below.
          </p>
          {autoWiredDbs.map((db) => (
            <AutoWiredDbValue key={db.id} projectId={projectId} db={db} />
          ))}
        </div>
      )}
      <EnvVarsEditor projectId={projectId} serviceEnvId={resolvedServiceEnvId} />
    </SectionCard>
  );
}

/**
 * P1.4 (mission finale, décision D2) : affiche la VALEUR RÉSOLUE effectivement
 * auto-injectée (l'URL de connexion interne de la base sœur, masquée + œil +
 * copie via CredentialField), calculée par le même mécanisme que
 * resolveAutoWiredDbEnv côté backend (endpoint credentials dédié, gaté par
 * l'accès projet — jamais le listing). L'utilisateur voit exactement ce qui
 * sera injecté, tout en pouvant le surcharger dans l'éditeur ci-dessous.
 */
function AutoWiredDbValue({
  projectId,
  db,
}: {
  projectId: string;
  db: { id: string; name: string; envVar: string };
}) {
  const { data, isLoading } = useServiceCredentials(projectId, db.id, true);
  const value = data?.internal.connectionUrl ?? "";
  return (
    <CredentialField
      label={`${db.envVar} — from ${db.name}`}
      value={isLoading ? "resolving…" : value || "unavailable"}
      secret={Boolean(value)}
    />
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
    "mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted";

  if (loading) {
    return <p className="text-xs text-muted">Loading…</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={lbl}>
          Variables{" "}
          <span className="normal-case text-muted/70">
            (.env format — NAME=value, one per line)
          </span>
        </label>
        <EnvTextEditor text={varsText} setText={setVarsText} />
      </div>
      <div>
        <label className={lbl}>Secrets (encrypted at rest · write-only)</label>
        <KvRows rows={secrets} setRows={setSecrets} secret />
        <p className="mt-1 text-[10px] text-muted">
          Leave empty to keep the existing secrets.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Save size={12} />
          )}{" "}
          Save
        </button>
        {msg && (
          <span className="text-xs text-secondary">{msg}</span>
        )}
      </div>
    </div>
  );
}
