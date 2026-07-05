"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Box,
  Braces,
  Container as ContainerIcon,
  Database,
  FileCode2,
  FolderGit2,
  GitPullRequestArrow,
  Globe,
  KeyRound,
  Loader2,
  ScrollText,
  Settings2,
  Trash2,
  Webhook,
} from "lucide-react";
import { getApiErrorMessage } from "@/shared/lib/api";
import { useProjectServices } from "@/features/projects/api/use-project-services";
import { useProjectDeployments } from "@/features/projects/api/use-project-deployments";
import { useProjectEnvironments } from "@/features/projects/api/use-project-environments";
import { useServiceActions } from "@/features/projects/api/use-service-actions";
import { DeployDialog } from "@/features/projects/components/deploy-dialog";
import { ProjectDeploymentsTab } from "@/features/projects/components/project-deployments-tab";
import { ServiceDeployBar } from "@/features/projects/components/tabs/service/service-deploy-bar";
import { PageHeader } from "@/shared/layout/page-header";
import { SectionCard } from "@/shared/layout/section-card";
import { ServiceConfigForm } from "@/features/projects/components/tabs/service/service-config-form";
import { ServiceWebhook } from "@/features/projects/components/tabs/service/service-webhook";
import { ServiceCiGenerator } from "@/features/projects/components/tabs/service/service-ci-generator";
import { ServiceTerminalDialog } from "@/features/projects/components/tabs/service/service-terminal-dialog";
import { ServiceDomains } from "@/features/projects/components/tabs/service/service-domains";
import { ServicePipelines } from "@/features/projects/components/tabs/service/service-pipelines";
import { ServiceMonitoring } from "@/features/projects/components/tabs/service/service-monitoring";
import { ServiceMetricsChart } from "@/features/projects/components/tabs/service/service-metrics-chart";
import { ServiceLogs } from "@/features/projects/components/tabs/service/service-logs";
import { ServiceVariablesTab } from "@/features/projects/components/tabs/service/service-variables-tab";
import { ServiceEnvironmentSelector } from "@/features/projects/components/tabs/service/service-environment-selector";
import { ServiceContainersTab } from "@/features/projects/components/tabs/service/service-containers-tab";
import { ServiceCredentials } from "@/features/projects/components/tabs/service/service-credentials";
import { DeploymentLogsDialog } from "@/features/projects/components/tabs/runs/deployment-logs-dialog";
import { resolveDeploymentUrl } from "@/features/deployments/utils";
import { KeyValueField } from "@/shared/ui/key-value-field";
import type { Service } from "@/features/projects/types/service";
import type { Deployment } from "@/features/deployments/types";

type Tab =
  | "general"
  | "credentials"
  | "pipeline"
  | "standardisation"
  | "variables"
  | "domains"
  | "webhooks"
  | "deployments"
  | "containers"
  | "monitoring"
  | "logs";
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "pipeline", label: "Pipeline", icon: GitPullRequestArrow },
  { id: "standardisation", label: "Standardisation", icon: FileCode2 },
  { id: "variables", label: "Variables", icon: Braces },
  { id: "domains", label: "Domains", icon: Globe },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "deployments", label: "Deployments", icon: Activity },
  { id: "containers", label: "Containers", icon: Box },
  { id: "monitoring", label: "Monitoring", icon: ContainerIcon },
  { id: "logs", label: "Logs", icon: ScrollText },
];
// DATABASE services get a "Credentials" tab (Internal/External connection
// details) inserted right after General — Pipeline/Standardisation (build
// concepts) are meaningless for a managed database and hidden for it.
const DB_CREDENTIALS_TAB: { id: Tab; label: string; icon: React.ElementType } = {
  id: "credentials",
  label: "Credentials",
  icon: KeyRound,
};

export default function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; serviceId: string }>;
}) {
  const { id: projectId, serviceId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("general");
  const [deployOpen, setDeployOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [logsDialog, setLogsDialog] = useState<{
    id: string;
    status: Deployment["status"];
  } | null>(null);

  const servicesQuery = useProjectServices(projectId);
  const deploymentsQuery = useProjectDeployments(projectId);
  const environmentsQuery = useProjectEnvironments(projectId);

  const services: Service[] = servicesQuery.data ?? [];
  const service = services.find((s) => s.id === serviceId) ?? null;
  const deployments: Deployment[] = (deploymentsQuery.deployments ?? []).filter(
    (d) => d.serviceId === serviceId,
  );
  const environments = environmentsQuery.data ?? [];
  const loading =
    servicesQuery.isLoading ||
    deploymentsQuery.loading ||
    environmentsQuery.isLoading;
  const error =
    (servicesQuery.error ? getApiErrorMessage(servicesQuery.error) : null) ??
    (environmentsQuery.error
      ? getApiErrorMessage(environmentsQuery.error)
      : null) ??
    deploymentsQuery.error;

  const reload = () => {
    void servicesQuery.refetch();
    void deploymentsQuery.refresh();
    void environmentsQuery.refetch();
  };

  // C2: environment selection lives in the URL (?env=<environmentId>), not in
  // local state — it survives a refresh and can be shared by link. Falls back
  // to the first environment when absent/stale (e.g. removed from the
  // service), same default the old selectedEnvId state used to apply.
  const envIdFromUrl = searchParams.get("env");
  const effectiveEnvId =
    (envIdFromUrl && environments.some((e) => e.id === envIdFromUrl)
      ? envIdFromUrl
      : environments[0]?.id) ?? "";

  const setEffectiveEnvId = (environmentId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("env", environmentId);
    router.replace(
      `/projects/${projectId}/services/${serviceId}?${params.toString()}`,
      { scroll: false },
    );
  };

  const lastDeployment = deployments[0] ?? null;
  const appUrl = lastDeployment ? resolveDeploymentUrl(lastDeployment) : null;
  const isDatabase = service?.type === "DATABASE";

  // DB services: insert Credentials after General and drop the build-only tabs
  // (Pipeline / Standardisation). Other services keep the full list.
  const visibleTabs = useMemo(() => {
    if (!isDatabase) return TABS;
    return TABS.filter(
      (t) => t.id !== "pipeline" && t.id !== "standardisation",
    ).flatMap((t) => (t.id === "general" ? [t, DB_CREDENTIALS_TAB] : [t]));
  }, [isDatabase]);

  const {
    deleting,
    stopping,
    redeploying,
    handleRedeploy,
    handleStop,
    handleDelete,
  } = useServiceActions({
    projectId,
    serviceId,
    service,
    environments,
    selectedEnvId: effectiveEnvId,
    lastDeployment,
    onDeployOpen: () => setDeployOpen(true),
    onReload: reload,
  });

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--text-secondary)]">
        <Loader2 size={15} className="animate-spin" /> Loading service…
      </div>
    );
  }
  if (error || !service) {
    return (
      <div className="p-6 text-sm text-red-400">
        {error ?? "Service not found."}
      </div>
    );
  }

  const TypeIcon = isDatabase
    ? Database
    : service.sourceType === "DOCKER_IMAGE"
      ? ContainerIcon
      : FolderGit2;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Service"
        title={service.name}
        description={
          isDatabase
            ? `${service.databaseType ?? "Database"} · ${service.databaseVersion ?? "latest"}`
            : (service.repoPath ??
              service.repoUrl ??
              service.sourceType ??
              "Application")
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/projects/${projectId}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              <ArrowLeft size={14} /> Project
            </Link>
            <ServiceEnvironmentSelector
              projectId={projectId}
              envLinks={service.envLinks}
              environments={environments}
              selectedEnvId={effectiveEnvId}
              onSelect={setEffectiveEnvId}
            />
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              title="Delete this service"
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}{" "}
              Delete
            </button>
          </div>
        }
      />

      {!isDatabase && (
        <ServiceDeployBar
          redeploying={redeploying}
          stopping={stopping}
          effectiveEnvId={effectiveEnvId}
          envName={environments.find((e) => e.id === effectiveEnvId)?.name}
          lastDeployment={lastDeployment}
          appUrl={appUrl}
          onDeploy={() => setDeployOpen(true)}
          onRedeploy={() => void handleRedeploy()}
          onStop={() => void handleStop()}
          onTerminal={() => setTerminalOpen(true)}
        />
      )}

      {/* Tabs */}
      <div className="border-b border-[var(--border)]">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {visibleTabs.map(({ id: tid, label, icon: Icon }) => (
            <button
              key={tid}
              type="button"
              onClick={() => setTab(tid)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${tab === tid ? "border-[var(--text-primary)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>
      </div>

      {/* General */}
      {tab === "general" && (
        <div className="space-y-4">
          {isDatabase ? (
            <>
              <SectionCard
                title="Database"
                description="Engine and connection details for this managed database."
              >
                <div className="flex items-center gap-2">
                  <TypeIcon
                    size={18}
                    className="text-[var(--text-secondary)]"
                  />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {service.databaseType} {service.databaseVersion ?? ""}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  {service.port != null && (
                    <KeyValueField k="Port" v={String(service.port)} />
                  )}
                </dl>
              </SectionCard>
            </>
          ) : (
            <ServiceConfigForm
              projectId={projectId}
              service={service}
              environmentId={effectiveEnvId}
              serviceEnvId={
                service.envLinks?.find(
                  (l) => l.environmentId === effectiveEnvId,
                )?.id ?? null
              }
              onSaved={() => reload()}
            />
          )}
        </div>
      )}

      {/* Credentials — DATABASE only : Internal/External connection details
          (Task 4). Loaded on demand from the dedicated, gated endpoint. */}
      {tab === "credentials" && isDatabase && (
        <ServiceCredentials
          projectId={projectId}
          serviceId={serviceId}
          active={tab === "credentials"}
        />
      )}

      {/* Pipeline — historique des runs GitLab/GitHub pour ce service. */}
      {tab === "pipeline" && (
        <ServicePipelines
          projectId={projectId}
          serviceId={serviceId}
          branch={service?.branch ?? null}
        />
      )}

      {/* Standardisation — générateur d'aperçu (Dockerfile + .dockerignore +
          fichier CI), séparé du Pipeline (Task 2, "Correction rapide"). */}
      {tab === "standardisation" && !isDatabase && (
        <ServiceCiGenerator projectId={projectId} serviceId={serviceId} />
      )}

      {/* Webhooks (onglet séparé — gère le webhook de déploiement) */}
      {tab === "webhooks" && (
        <ServiceWebhook projectId={projectId} serviceId={serviceId} />
      )}

      {/* B4: Variables — remplace l'ancien onglet "Environments" (liste
          PRODUCTION/STAGING à déplier) par l'éditeur direct pour
          l'environnement déjà sélectionné dans le header de la page. */}
      {tab === "variables" && (
        <ServiceVariablesTab
          projectId={projectId}
          serviceId={serviceId}
          environmentId={effectiveEnvId}
          serviceEnvId={
            service.envLinks?.find((l) => l.environmentId === effectiveEnvId)
              ?.id ?? null
          }
        />
      )}

      {/* Domains */}
      {tab === "domains" && (
        <ServiceDomains
          projectId={projectId}
          serviceEnvId={
            service.envLinks?.find((l) => l.environmentId === effectiveEnvId)
              ?.id ?? null
          }
          envName={environments.find((e) => e.id === effectiveEnvId)?.name}
          envsLoading={environmentsQuery.isLoading}
        />
      )}

      {/* Deployments — historique + logs par déploiement (en dialog) */}
      {tab === "deployments" && (
        <ProjectDeploymentsTab
          deployments={deployments}
          loading={loading}
          error={error}
          projectId={projectId}
          onRefresh={() => reload()}
          hideViewAllLink
          onOpenDetails={(dep) =>
            setLogsDialog({ id: dep.id, status: dep.status })
          }
        />
      )}

      {/* Containers : stats/actions/logs du conteneur de l'environnement sélectionné */}
      {tab === "containers" && (
        <ServiceContainersTab
          serviceEnvId={
            service.envLinks?.find((l) => l.environmentId === effectiveEnvId)
              ?.id ?? null
          }
          currentDeploymentId={
            service.envLinks?.find((l) => l.environmentId === effectiveEnvId)
              ?.currentDeploymentId ?? null
          }
        />
      )}

      {/* Monitoring : stats live + historique (courbes + marqueurs de déploiement) */}
      {tab === "monitoring" && (
        <div className="space-y-4">
          {/* C5: both sub-blocks now follow the SAME ServiceEnvironment (the
              one selected above) — "stats live" used to follow the service's
              globally-last deployment across every environment instead. */}
          <ServiceMonitoring
            deploymentId={
              service.envLinks?.find((l) => l.environmentId === effectiveEnvId)
                ?.currentDeploymentId ?? null
            }
          />
          <ServiceMetricsChart
            serviceEnvId={
              service.envLinks?.find((l) => l.environmentId === effectiveEnvId)
                ?.id ?? null
            }
            deployments={deployments}
          />
        </div>
      )}

      {/* Logs : recherche historique centralisée (Loki) par période */}
      {tab === "logs" && (
        <ServiceLogs
          serviceEnvId={
            service.envLinks?.find((l) => l.environmentId === effectiveEnvId)
              ?.id ?? null
          }
        />
      )}

      <DeployDialog
        projectId={projectId}
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        onCreated={() => {
          setDeployOpen(false);
          reload();
        }}
        services={services}
        initialServiceId={serviceId}
        initialEnvironmentId={effectiveEnvId || undefined}
      />

      <ServiceTerminalDialog
        projectId={projectId}
        envId={effectiveEnvId || null}
        envName={environments.find((e) => e.id === effectiveEnvId)?.name}
        open={terminalOpen}
        onClose={() => setTerminalOpen(false)}
      />

      {/* Détails/logs d'un déploiement en popup — on reste dans le service. */}
      <DeploymentLogsDialog
        open={logsDialog !== null}
        deploymentId={logsDialog?.id ?? null}
        initialStatus={logsDialog?.status ?? null}
        onClose={() => setLogsDialog(null)}
      />
    </div>
  );
}
