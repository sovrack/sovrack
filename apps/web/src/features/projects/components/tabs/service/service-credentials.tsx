"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Globe, Loader2, Lock, Save } from "lucide-react";
import { SectionCard } from "@/shared/layout/section-card";
import { Button } from "@/shared/ui/button";
import { useToast } from "@/shared/contexts/toast-context";
import { getApiErrorMessage } from "@/shared/lib/api";
import { servicesService } from "@/features/projects/api/services.service";
import { useServiceCredentials } from "@/features/projects/api/use-service-credentials";
import { projectKeys } from "@/features/projects/api/project-query-keys";
import { CredentialField } from "./credential-field";

/**
 * Task 4 ("Sécurité database + UI" mission): Internal / External Credentials
 * for a DATABASE service. Credentials are loaded from the dedicated, gated
 * endpoint (useServiceCredentials) — never from the general service listing,
 * which omits them (Task 1 fix) — so this panel does not reintroduce the leak.
 */
export function ServiceCredentials({
  projectId,
  serviceId,
  active,
}: {
  projectId: string;
  serviceId: string;
  /** Only fetch the secrets once this panel is actually shown. */
  active: boolean;
}) {
  const query = useServiceCredentials(projectId, serviceId, active);
  const queryClient = useQueryClient();
  const showToast = useToast();

  const creds = query.data;

  // External-exposure editor local state (seeded from the loaded creds).
  const [exposeEnabled, setExposeEnabled] = useState<boolean | null>(null);
  const [portInput, setPortInput] = useState<string>("");
  const [saving, setSaving] = useState(false);

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-secondary">
        <Loader2 size={15} className="animate-spin" /> Loading credentials…
      </div>
    );
  }
  if (query.error || !creds) {
    return (
      <div className="p-6 text-sm text-red-400">
        {query.error
          ? getApiErrorMessage(query.error)
          : "Credentials unavailable."}
      </div>
    );
  }

  // Controlled values fall back to the loaded credentials until the user edits.
  const enabled = exposeEnabled ?? creds.external.enabled;
  const port =
    portInput !== ""
      ? portInput
      : String(creds.external.port ?? creds.internal.port);

  const save = async () => {
    setSaving(true);
    try {
      let externalPort: number | null = null;
      if (enabled) {
        const parsed = Number(port);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
          showToast("Enter a valid port (1–65535).", "error");
          setSaving(false);
          return;
        }
        externalPort = parsed;
      }
      // null clears external exposure; the backend writes it as long as the
      // key is present (dto.externalPort !== undefined).
      await servicesService.update(projectId, serviceId, { externalPort });
      await queryClient.invalidateQueries({
        queryKey: projectKeys.serviceCredentials(projectId, serviceId),
      });
      await queryClient.invalidateQueries({
        queryKey: projectKeys.services(projectId),
      });
      showToast("External access updated.", "success");
      setExposeEnabled(null);
      setPortInput("");
    } catch (e) {
      showToast(getApiErrorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Internal Credentials"
        description="Used automatically by other services in this project — they connect over the internal Docker network, no external exposure needed."
      >
        <div className="mb-3 flex items-center gap-2 text-xs text-secondary">
          <Lock size={13} /> Reachable only from inside this project&apos;s
          network.
        </div>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CredentialField label="User" value={creds.internal.user} />
          <CredentialField label="Database name" value={creds.internal.dbName} />
          <CredentialField label="Password" value={creds.internal.password} secret />
          {creds.internal.rootPassword && (
            <CredentialField
              label="Root password"
              value={creds.internal.rootPassword}
              secret
            />
          )}
          <CredentialField
            label="Internal host"
            value={creds.internal.host}
          />
          <CredentialField
            label="Internal port"
            value={String(creds.internal.port)}
          />
        </dl>
        <div className="mt-2">
          <CredentialField
            label={`Internal connection URL (${creds.internal.connectionUrlEnvKey})`}
            value={creds.internal.connectionUrl}
            secret
          />
        </div>
      </SectionCard>

      <SectionCard
        title="External Credentials"
        description="Only needed if you want to connect from outside this project."
      >
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <p>
            Only needed if you want to connect from outside this project.{" "}
            <strong>
              Not required for other services in this project to connect
            </strong>{" "}
            — they use the Internal connection automatically.
          </p>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-primary">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setExposeEnabled(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <Globe size={14} className="text-secondary" />
          Expose this database on a host port
        </label>

        {enabled && (
          <div className="mt-3 max-w-xs">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-secondary">
              External port
            </label>
            <input
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPortInput(e.target.value)}
              className="w-full rounded-lg border border-border bg-app px-3 py-2 text-sm text-primary outline-none focus:border-muted"
            />
            <p className="mt-1 text-[11px] text-secondary">
              Published on the server host. The container port stays{" "}
              {creds.internal.port}.
            </p>
          </div>
        )}

        <div className="mt-4">
          <Button
            onClick={() => void save()}
            loading={saving}
            icon={saving ? undefined : <Save size={14} />}
          >
            Save external access
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
