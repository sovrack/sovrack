"use client";

import { useEffect, useState } from "react";
import { environmentsService } from "@/features/projects/api/environments.service";
import { getApiErrorMessage } from "@/shared/lib/api";

/**
 * Resolves the ServiceEnvironment id for (serviceId × environmentId), auto-
 * creating the link on the fly if missing. Extracted from ServiceVariablesTab
 * (B4) — a legacy service (created before the auto-link service↔environment
 * mechanism existed) may not yet have a ServiceEnvironment row for a given
 * environment; rather than showing a false "no environment", this upserts one.
 * Shared by ServiceVariablesTab and ServiceConfigForm's Auto-deploy control
 * ("Correction rapide" mission, Task 1 — same ServiceEnvironment context is
 * needed in both places).
 */
export function useResolvedServiceEnvId(
  projectId: string,
  serviceId: string,
  environmentId: string,
  serviceEnvId: string | null,
) {
  const [resolvedServiceEnvId, setResolvedServiceEnvId] = useState(
    serviceEnvId,
  );
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    setResolvedServiceEnvId(serviceEnvId);
    setLinkError(null);
  }, [serviceEnvId, environmentId]);

  useEffect(() => {
    if (resolvedServiceEnvId || !environmentId) return;
    let alive = true;
    setLinking(true);
    environmentsService
      .linkService(projectId, environmentId, serviceId)
      .then(() => environmentsService.getServiceLinks(projectId, environmentId))
      .then((links) => {
        if (!alive) return;
        const created = links.find((l) => l.serviceId === serviceId) ?? null;
        if (created) setResolvedServiceEnvId(created.id);
      })
      .catch((e: unknown) => {
        if (alive) setLinkError(getApiErrorMessage(e));
      })
      .finally(() => {
        if (alive) setLinking(false);
      });
    return () => {
      alive = false;
    };
  }, [resolvedServiceEnvId, environmentId, projectId, serviceId]);

  return { resolvedServiceEnvId, linking, linkError };
}
