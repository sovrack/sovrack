"use client";

import { useEffect, useMemo, useState } from "react";
import { deploymentsService } from "@/features/deployments";
import { getApiErrorMessage } from "@/shared/lib/api";
import type { ValidationIssue } from "@/features/projects/components/deploy-dialog.parts";
import type { BuildSource, DeployValidationResult } from "@/features/deployments";
import type { Environment, Service } from "@/features/projects";

export type { ValidationIssue } from "@/features/projects/components/deploy-dialog.parts";

type UseDeployValidationParams = {
  projectId: string;
  open: boolean;
  loading: boolean;
  services: Service[];
  selectedServiceId: string;
  environments: Environment[];
  primaryEnvId: string;
  effectiveBuildSource: BuildSource;
};

/** Pure derivation of client-side build readiness for one service. */
function checkBuildReady(svc: Service | undefined) {
  if (!svc) return { hasSource: false, hasBuildConfig: false };
  if (svc.type === "DATABASE" || svc.sourceType === "DOCKER_IMAGE") {
    return { hasSource: true, hasBuildConfig: true };
  }
  const src = !!(svc.repoPath || svc.repoUrl);
  return { hasSource: src, hasBuildConfig: src && !!svc.buildPack };
}

/**
 * Pre-submission deploy validation — extracted from DeployDialog (see the
 * Sprints 4+5+6 mission, B3). Two layers, preserved exactly as before:
 *  1. `issues`: client-side derived checks (no source/build config/environment)
 *     computed synchronously from already-loaded data.
 *  2. `validation`: server-side check (`deploymentsService.validate`), fired
 *     whenever the primary environment changes, skipped while `issues`
 *     already reports a blocking `no-environment` problem.
 */
export function useDeployValidation({
  projectId,
  open,
  loading,
  services,
  selectedServiceId,
  environments,
  primaryEnvId,
  effectiveBuildSource,
}: UseDeployValidationParams) {
  const [validation, setValidation] = useState<DeployValidationResult | null>(
    null,
  );
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);

  const issues = useMemo<ValidationIssue[]>(() => {
    if (loading) return [];
    const svc = services.find((s) => s.id === selectedServiceId) ?? services[0];
    const { hasSource: src, hasBuildConfig: buildReady } = checkBuildReady(svc);
    const svcConfigHref = svc
      ? `/projects/${projectId}/services/${svc.id}`
      : `/projects/${projectId}`;
    const detected: ValidationIssue[] = [];
    if (services.length > 0 && !src)
      detected.push({
        type: "no-source",
        message: `${svc?.name ?? "Service"}: no Git source configured.`,
        href: svcConfigHref,
      });
    if (services.length > 0 && !buildReady)
      detected.push({
        type: "no-build-config",
        message: `${svc?.name ?? "Service"}: build pack not configured.`,
        href: svcConfigHref,
      });
    if (environments.length === 0)
      detected.push({
        type: "no-environment",
        message: "No environment configured.",
        href: `/projects/${projectId}?openEnvironments=true`,
      });
    return detected;
  }, [loading, services, selectedServiceId, environments, projectId]);

  useEffect(() => {
    if (
      !open ||
      loading ||
      issues.some((i) => i.type === "no-environment") ||
      !primaryEnvId
    ) {
      setValidation(null);
      return;
    }

    let cancelled = false;
    setValidating(true);
    setValidateError(null);

    deploymentsService
      .validate(projectId, primaryEnvId, effectiveBuildSource)
      .then((result) => {
        if (!cancelled) setValidation(result);
      })
      .catch((err) => {
        if (!cancelled) setValidateError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setValidating(false);
      });

    return () => {
      cancelled = true;
    };
    // Intentionally omit effectiveBuildSource and issues from deps:
    // re-validating on every derived-value change would trigger excessive API calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, primaryEnvId, projectId]);

  // Reset when the dialog closes — mirrors DeployDialog's own reset-on-close
  // effect for these 2 fields (validation is also cleared by the effect
  // above when !open, but validateError is not — kept here for parity).
  useEffect(() => {
    if (!open) {
      setValidation(null);
      setValidateError(null);
    }
  }, [open]);

  return { issues, validation, validating, validateError };
}
