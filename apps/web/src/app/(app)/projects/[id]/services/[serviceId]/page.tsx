"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Container as ContainerIcon,
  Database,
  FolderGit2,
  GitPullRequestArrow,
  Globe,
  Layers,
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
import { useServiceActions } from "@/features/projects/hooks/use-service-actions";
import { DeployDialog } from "@/features/deployments/components/deploy-dialog";
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
import { ServiceEnvironments } from "@/features/projects/components/tabs/service/service-environments";
import { DeploymentLogsDialog } from "@/features/projects/components/tabs/runs/deployment-logs-dialog";
import { DatabaseBackupsPanel } from "@/features/databases";
import { resolveDeploymentUrl } from "@/features/deployments/utils";
import { Field } from "@/shared/ui/field";
import type { Service } from "@/features/projects/types/service";
import type { Deployment } from "@/features/deployments/types";

type Tab =
  | "general"
  | "cicd"
  | "environments"
  | "domains"
  | "webhooks"
  | "deployments"
  | "monitoring"
  | "logs";
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "cicd", label: "CI/CD", icon: GitPullRequestArrow },
  { id: "environments", label: "Environments", icon: Layers },
  { id: "domains", label: "Domains", icon: Globe },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "deployments", label: "Deployments", icon: Activity },
  { id: "monitoring", label: "Monitoring", icon: ContainerIcon },
  { id: "logs", label: "Logs", icon: ScrollText },
];

export default function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; serviceId: string }>;
}) {
  const { id: projectId, serviceId } = use(params);
  const [tab, setTab] = useState<Tab>("general");
  const [deployOpen, setDeployOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [selectedEnvId, setSelectedEnvId] = useState<string>("");
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
  const environments = (environmentsQuery.data ?? []).map((e) => ({
    id: e.id,
    name: e.name,
  }));
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

  useEffect(() => {
    const first = environmentsQuery.data?.[0]?.id;
    if (first) setSelectedEnvId((prev) => prev || first);
  }, [environmentsQuery.data]);

  const lastDeployment = deployments[0] ?? null;
  const appUrl = lastDeployment ? resolveDeploymentUrl(lastDeployment) : null;
  const isDatabase = service?.type === "DATABASE";
  const effectiveEnvId = selectedEnvId || environments[0]?.id;

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
    selectedEnvId,
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
          {TABS.map(({ id: tid, label, icon: Icon }) => (
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
                    <Field k="Port" v={String(service.port)} />
                  )}
                </dl>
              </SectionCard>

              {/* Backups : à leur place — sur le service DATABASE, scopés à l'env
                  sélectionné (avant : égarés dans l'onglet Environments du projet). */}
              {(() => {
                const dbLinkId = service.envLinks?.find(
                  (l) => l.environmentId === effectiveEnvId,
                )?.id;
                return dbLinkId ? (
                  <DatabaseBackupsPanel
                    serviceEnvId={dbLinkId}
                    serviceName={service.name}
                  />
                ) : null;
              })()}
            </>
          ) : (
            <ServiceConfigForm
              projectId={projectId}
              service={service}
              onSaved={() => reload()}
            />
          )}
        </div>
      )}

      {/* CI/CD — générateur (Dockerfile + .dockerignore + fichier CI) + runs pipeline */}
      {tab === "cicd" && (
        <div className="space-y-4">
          {!isDatabase && (
            <ServiceCiGenerator projectId={projectId} serviceId={serviceId} />
          )}
          <ServicePipelines
            projectId={projectId}
            serviceId={serviceId}
            branch={service?.branch ?? null}
          />
        </div>
      )}

      {/* Webhooks (onglet séparé — gère le webhook de déploiement) */}
      {tab === "webhooks" && (
        <ServiceWebhook projectId={projectId} serviceId={serviceId} />
      )}

      {/* Environnements (liens service↔env + variables/secrets par env) */}
      {tab === "environments" && (
        <ServiceEnvironments
          projectId={projectId}
          serviceId={serviceId}
          environments={environments}
          envLinks={service.envLinks ?? []}
          onChanged={() => reload()}
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

      {/* Monitoring : stats live + historique (courbes + marqueurs de déploiement) */}
      {tab === "monitoring" && (
        <div className="space-y-4">
          <ServiceMonitoring deploymentId={lastDeployment?.id ?? null} />
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
        initialEnvironmentId={selectedEnvId || undefined}
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
