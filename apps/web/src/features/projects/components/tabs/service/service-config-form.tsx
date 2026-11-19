"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Save } from "lucide-react";
import { servicesService } from "@/features/projects/api/services.service";
import { projectsService } from "@/features/projects/api/projects.service";
import { environmentsService } from "@/features/projects/api/environments.service";
import { useResolvedServiceEnvId } from "@/features/projects/api/use-resolved-service-env-id";
import { getApiErrorMessage } from "@/shared/lib/api";
import { splitImageRef } from "@/features/deployments/utils";
import { SectionCard } from "@/shared/layout/section-card";
import { useProjectBranches } from "@/features/projects/api/use-project-branches";
import {
  AutoDeployControl,
  BuildArgsEditor,
  RegistryImageFields,
  RootDirField,
  rowsToRecord,
  type BuildArgRow,
} from "./service-config-form.parts";
import type {
  BuildPack,
  Service,
  UpdateServicePayload,
} from "@/features/projects/types/service";
import type { SourceProviderOption } from "@/features/projects/types/project";

// Build packs proposés à l'utilisateur. BUILDPACK (Cloud Native Buildpacks)
// est volontairement omis : non implémenté côté moteur (pas de `pack build`) ;
// Nixpacks couvre le même besoin « build sans Dockerfile » et fonctionne.
// DOCKER_COMPOSE est également omis : le moteur de déploiement ne déploie qu'un
// seul conteneur (pas d'expansion d'un stack compose en N services) — l'offrir
// créerait un service qui ne se déploie jamais. À réactiver quand l'exécuteur
// compose multi-conteneurs sera implémenté.
const BUILD_PACKS: { value: BuildPack; label: string }[] = [
  { value: "DOCKERFILE", label: "Dockerfile" },
  { value: "NIXPACKS", label: "Nixpacks" },
  { value: "STATIC", label: "Static site" },
  { value: "NONE", label: "None" },
];

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]";
const labelClass =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]";

/**
 * Per-service editable Source/Build configuration (PLAN_AMELIORATION.md §5.1
 * "build contextuel"). Backed by the existing PUT /projects/:id/services/:id
 * endpoint — the Service model already carries all these fields, so no backend
 * change is required.
 *
 * Task 1 ("Correction rapide" mission): also hosts the "Auto-deploy on push"
 * control, moved here from the old Variables tab. It is a DISTINCT setting
 * from "Deployment trigger" below (confirmed by backend investigation, not a
 * duplicate) — Deployment trigger (Service.deployTrigger) gates WHICH webhook
 * event type (push vs CI pipeline success vs manual) is even allowed to start
 * an auto-deploy attempt for this service; Auto-deploy on push
 * (ServiceEnvironment.autoDeploy/autoBranch) then gates WHICH environment(s)
 * actually deploy, and on which branch — a per-environment setting, still
 * saved via the same environments-service endpoint as before, just relocated
 * in the UI next to its Service-level counterpart.
 */
export function ServiceConfigForm({
  projectId,
  service,
  environmentId,
  serviceEnvId,
  onSaved,
}: {
  projectId: string;
  service: Service;
  environmentId: string;
  serviceEnvId: string | null;
  onSaved: () => void;
}) {
  const [branch, setBranch] = useState(service.branch ?? "");
  const [buildPack, setBuildPack] = useState<BuildPack>(
    service.buildPack ?? "DOCKERFILE",
  );
  const [buildMode, setBuildMode] = useState<string>(
    service.buildMode ?? "LOCAL",
  );
  const [deployTrigger, setDeployTrigger] = useState<string>(
    service.deployTrigger ?? "PUSH",
  );
  const [port, setPort] = useState(
    service.port != null ? String(service.port) : "",
  );
  const [startCommand, setStartCommand] = useState(service.startCommand ?? "");
  const [healthcheckPath, setHealthcheckPath] = useState(
    service.healthcheckPath ?? "",
  );
  const [dockerfile, setDockerfile] = useState(service.dockerfile ?? "");
  // Monorepo: subfolder to build from (empty / "/" = repo root).
  const [rootDir, setRootDir] = useState(
    service.rootDir && service.rootDir !== "/" ? service.rootDir : "",
  );
  // Build-time variables, pre-filled from the service (GET returns buildArgs).
  const [buildArgRows, setBuildArgRows] = useState<BuildArgRow[]>(
    Object.entries(service.buildArgs ?? {}).map(([key, value]) => ({
      key,
      value: String(value ?? ""),
    })),
  );
  // B1: Provider + Repository path are locked forever once the service
  // exists — no setter, no fallback-to-default. A prior version let the user
  // click through a provider picker post-creation (silently inconsistent
  // with the existing webhook, which stays registered against the ORIGINAL
  // provider — see VERIFICATION_ORGANISATION_FINALE.md / AUDIT_VERIFICATION_UI.md
  // Point 5) and defaulted an empty providerId to "the first provider" on
  // load, which would have silently assigned one without any user action.
  const providerId = service.providerId ?? "";
  // Dépôt figé (lecture seule) — pas de setter.
  const repoPath = service.repoPath ?? service.repoUrl ?? "";
  // Image externe (sourceType DOCKER_IMAGE) : la référence d'image:tag EST stockée
  // dans repoPath → on l'édite via 2 champs Image + Tag (cf. C3 / Docker Registry).
  const isExternalImage = service.sourceType === "DOCKER_IMAGE";
  const isRegistryMode = buildMode.toUpperCase() === "REGISTRY";
  const initialRef = splitImageRef(repoPath);
  const [image, setImage] = useState(initialRef.image);
  const [tag, setTag] = useState(initialRef.tag);
  // Mode REGISTRY : image:tag à tirer (persistée dans Service.registryImage).
  const initialRegistryRef = splitImageRef(service.registryImage ?? "");
  const [registryImageName, setRegistryImageName] = useState(
    initialRegistryRef.image,
  );
  const [registryTag, setRegistryTag] = useState(initialRegistryRef.tag);
  const [providers, setProviders] = useState<SourceProviderOption[]>([]);
  const resolvedProvider = providers.find((p) => p.id === providerId) ?? null;
  // B2: real repo URL, built from the provider's own base URL + the stored
  // repoPath (e.g. "https://gitlab.com" + "group/api") — both GitLab and
  // GitHub repo web pages resolve at exactly this path shape.
  const repoWebUrl =
    resolvedProvider && repoPath
      ? `${resolvedProvider.url.replace(/\/+$/, "")}/${repoPath.replace(/^\/+/, "")}`
      : null;

  // F-4 fix: use React Query for branches (shared cache, no memory leak).
  // B3 fix: scope the fetch to THIS service so a multi-service project
  // doesn't show another service's branches (see use-project-branches.ts).
  const branchesQuery = useProjectBranches(projectId, true, service.id);
  const branches = (branchesQuery.data ?? []).map((b) => b.name);

  // Task 1: Auto-deploy on push is a ServiceEnvironment-level setting (see
  // the doc comment above) — resolve the ServiceEnvironment for the
  // currently-selected environment (same auto-link safety net the Variables
  // tab uses) and load/save it independently of the Service-level fields.
  const { resolvedServiceEnvId, linking } = useResolvedServiceEnvId(
    projectId,
    service.id,
    environmentId,
    serviceEnvId,
  );
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [autoBranch, setAutoBranch] = useState("main");
  const [autoDeployLoading, setAutoDeployLoading] = useState(false);

  useEffect(() => {
    if (!resolvedServiceEnvId) return;
    let alive = true;
    setAutoDeployLoading(true);
    environmentsService
      .getServiceLink(projectId, resolvedServiceEnvId)
      .then((se) => {
        if (!alive) return;
        setAutoDeploy(!!se.autoDeploy);
        setAutoBranch(se.autoBranch ?? "main");
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setAutoDeployLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId, resolvedServiceEnvId]);

  // F-4 fix: cleanup via AbortController so the setState after unmount is prevented.
  // B1: only fetched to resolve providerId → display name; never used to
  // change or default the service's own (locked) provider.
  useEffect(() => {
    const controller = new AbortController();
    projectsService
      .getSourceProviders()
      .then((list) => {
        if (controller.signal.aborted) return;
        setProviders(list);
      })
      .catch(() => {
        if (!controller.signal.aborted) setProviders([]);
      });
    return () => controller.abort();
  }, []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setError(null);
    setSaved(false);

    // F-2: Client-side validation before hitting the API.
    if (port) {
      const portNum = Number(port);
      if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
        setError("Port must be an integer between 1 and 65535.");
        return;
      }
    }
    if (!isExternalImage && !branch.trim()) {
      setError("Branch is required for Git-sourced services.");
      return;
    }
    if (isExternalImage && !image.trim()) {
      setError("Docker image name is required.");
      return;
    }
    // Root directory must stay inside the clone: relative, no traversal.
    if (rootDir.includes("..")) {
      setError("Root directory can't contain '..' (no path traversal).");
      return;
    }

    setSaving(true);
    try {
      const payload: UpdateServicePayload = {
        branch: branch.trim() || undefined,
        buildPack,
        buildMode: buildMode as UpdateServicePayload["buildMode"],
        deployTrigger: deployTrigger as UpdateServicePayload["deployTrigger"],
        port: port ? Number(port) : undefined,
        startCommand: startCommand.trim() || undefined,
        healthcheckPath: healthcheckPath.trim() || undefined,
        // Monorepo + build-time vars: only meaningful for Git-sourced services
        // (a DOCKER_IMAGE service has no build). Always sent (even in Registry
        // mode) so switching modes never silently wipes the values; the backend
        // simply ignores buildArgs when the CI does the build.
        ...(!isExternalImage
          ? {
              rootDir: rootDir.trim().replace(/^\/+/, "") || "/",
              buildArgs: rowsToRecord(buildArgRows),
            }
          : {}),
        ...(buildPack === "DOCKERFILE" && dockerfile.trim()
          ? { dockerfile }
          : {}),
        // B1: provider is locked forever — never sent, so it can never be
        // changed via this form (see providerId declaration above). Repo
        // path is ALSO locked for GIT-sourced services (nothing to send —
        // it can't change here); for a DOCKER_IMAGE source it's still the
        // legitimately-editable image:tag reference.
        ...(isExternalImage && image.trim()
          ? {
              repoPath: `${image.trim()}${tag.trim() ? `:${tag.trim()}` : ""}`,
            }
          : {}),
        // Mode REGISTRY : image:tag à tirer (vide = dérivation auto par la CI).
        ...(isRegistryMode && !isExternalImage
          ? {
              registryImage: registryImageName.trim()
                ? `${registryImageName.trim()}${registryTag.trim() ? `:${registryTag.trim()}` : ""}`
                : "",
            }
          : {}),
      };
      await servicesService.update(projectId, service.id, payload);
      // Task 1: saved independently via its own (ServiceEnvironment-level)
      // endpoint — same call the old Variables tab made, just triggered from
      // this form's Save button now that the control lives here.
      if (resolvedServiceEnvId) {
        await environmentsService.updateServiceLink(
          projectId,
          resolvedServiceEnvId,
          { autoDeploy, autoBranch: autoBranch.trim() || "main" },
        );
      }
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Source"
        description="Where this service's code comes from — choose a provider and repository."
      >
        {/* B1: informational only — the provider is fixed at creation and
            never editable here (a clickable picker previously let it be
            switched post-creation, silently drifting from the webhook
            still registered against the original provider). */}
        {providerId && (
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            Provider:{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {resolvedProvider
                ? `${resolvedProvider.name} · ${resolvedProvider.type}`
                : providerId}
            </span>
          </p>
        )}
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {isExternalImage ? (
            <>
              <div>
                <label className={labelClass} htmlFor="svc-image">
                  Image Docker
                </label>
                <input
                  id="svc-image"
                  className={`${inputClass} font-mono`}
                  value={image}
                  placeholder="nginx ou registry.gitlab.com/grp/app"
                  onChange={(e) => setImage(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="svc-tag">
                  Tag
                </label>
                <input
                  id="svc-tag"
                  className={`${inputClass} font-mono`}
                  value={tag}
                  placeholder="latest"
                  onChange={(e) => setTag(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="sm:col-span-2">
              <span className={labelClass}>Repository path</span>
              {/* B1: plain informational text, not a form field — a
                  readOnly <input> still visually suggests it might become
                  editable. Source is fixed at creation (changer de dépôt =
                  créer un autre service).
                  B2: clickable through to the real repo page when the
                  provider's base URL is known — built from provider.url +
                  repoPath, no new backend data needed. */}
              <div
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-sm text-[var(--text-secondary)]"
                title="The repository is fixed. To change it, create a new service."
              >
                {repoWebUrl ? (
                  <a
                    href={repoWebUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[var(--text-primary)] underline decoration-dotted hover:text-[var(--text-primary)]/80"
                  >
                    {repoPath} <ExternalLink size={12} />
                  </a>
                ) : (
                  repoPath || "—"
                )}
              </div>
            </div>
          )}
        </dl>
      </SectionCard>

      <SectionCard
        title="Build"
        description="How this service is built and run."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* P1.3 (mission finale) : Branch déplacé ici depuis la carte Source
              — la branche est un paramètre de BUILD (que construire), pas de
              provenance du dépôt. Logique inchangée (sélecteur dynamique
              useProjectBranches, avec repli input + option "(current)"). */}
          {!isExternalImage && (
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="svc-branch">
                Branch
              </label>
              {branchesQuery.isLoading ? (
                <div
                  className={`${inputClass} flex items-center gap-2 text-[var(--text-muted)]`}
                >
                  <Loader2 size={14} className="animate-spin" /> Loading
                  branches…
                </div>
              ) : branches.length > 0 ? (
                <select
                  id="svc-branch"
                  className={inputClass}
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                >
                  {branch && !branches.includes(branch) && (
                    <option value={branch}>{branch} (current)</option>
                  )}
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="svc-branch"
                  className={inputClass}
                  value={branch}
                  placeholder="main"
                  onChange={(e) => setBranch(e.target.value)}
                />
              )}
            </div>
          )}
          {!isExternalImage && (
            <RootDirField value={rootDir} onChange={setRootDir} />
          )}
          <div>
            <label className={labelClass} htmlFor="svc-buildpack">
              Build pack
            </label>
            <select
              id="svc-buildpack"
              className={inputClass}
              value={buildPack}
              onChange={(e) => setBuildPack(e.target.value as BuildPack)}
            >
              {BUILD_PACKS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="svc-buildmode">
              Build mode
            </label>
            <select
              id="svc-buildmode"
              className={inputClass}
              value={buildMode}
              onChange={(e) => setBuildMode(e.target.value)}
            >
              <option value="LOCAL">Build on server (on the VPS)</option>
              <option value="REGISTRY">
                Registry (image built by CI → pull)
              </option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="svc-trigger">
              Deployment trigger
            </label>
            <select
              id="svc-trigger"
              className={inputClass}
              value={deployTrigger}
              onChange={(e) => setDeployTrigger(e.target.value)}
            >
              <option value="PUSH">Push — deploy on every git push</option>
              <option value="PIPELINE_SUCCESS">
                Pipeline success — deploy when CI goes green
              </option>
              {/* E5 : CI_HOOK existait côté backend (mode utilisé par la CI
                  générée dans Standardisation via DA_DEPLOY_HOOK) mais
                  était introuvable dans ce sélecteur — l'utilisateur qui
                  suivait ce parcours ne pouvait pas choisir le mode
                  correspondant. */}
              <option value="CI_HOOK">
                CI hook — your CI calls the deploy hook (Standardisation)
              </option>
              <option value="MANUAL">Manual — deploy on demand only</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Auto-deploy on push</span>
            <AutoDeployControl
              environmentId={environmentId}
              autoDeploy={autoDeploy}
              setAutoDeploy={setAutoDeploy}
              autoBranch={autoBranch}
              setAutoBranch={setAutoBranch}
              disabled={linking || autoDeployLoading || !resolvedServiceEnvId}
              isBusy={linking || autoDeployLoading}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="svc-port">
              Port
            </label>
            <input
              id="svc-port"
              type="number"
              min={1}
              className={`${inputClass} font-mono`}
              value={port}
              placeholder="3000"
              onChange={(e) => setPort(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="svc-start">
              Start command
            </label>
            <input
              id="svc-start"
              className={`${inputClass} font-mono`}
              value={startCommand}
              placeholder="npm run start:prod"
              onChange={(e) => setStartCommand(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="svc-health">
              Healthcheck path
            </label>
            <input
              id="svc-health"
              className={`${inputClass} font-mono`}
              value={healthcheckPath}
              placeholder="/health"
              onChange={(e) => setHealthcheckPath(e.target.value)}
            />
          </div>
          {!isExternalImage && (
            <BuildArgsEditor
              rows={buildArgRows}
              onChange={setBuildArgRows}
              isRegistryMode={isRegistryMode}
            />
          )}
          {buildPack === "DOCKERFILE" && (
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="svc-dockerfile">
                Dockerfile (optional override)
              </label>
              <textarea
                id="svc-dockerfile"
                rows={6}
                className={`${inputClass} font-mono`}
                value={dockerfile}
                placeholder={"FROM node:20\nWORKDIR /app\n..."}
                onChange={(e) => setDockerfile(e.target.value)}
              />
            </div>
          )}
          {isRegistryMode && !isExternalImage && (
            <RegistryImageFields
              image={registryImageName}
              setImage={setRegistryImageName}
              tag={registryTag}
              setTag={setRegistryTag}
            />
          )}
        </div>
      </SectionCard>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Save size={15} />
          )}{" "}
          Save configuration
        </button>
        {saved && !saving && (
          <span className="inline-flex items-center gap-1.5 text-sm text-green-400">
            <CheckCircle2 size={15} /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
