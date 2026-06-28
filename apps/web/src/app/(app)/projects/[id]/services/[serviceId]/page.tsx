'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  RefreshCw,
  Rocket,
  ScrollText,
  Settings2,
  StopCircle,
  TerminalSquare,
  Trash2,
  Webhook,
} from 'lucide-react';
import { getApiErrorMessage } from '@/shared/lib/api';
import { useConfirm } from '@/shared/contexts/confirm-context';
import { servicesService } from '@/features/projects/api/services.service';
import { deploymentsService } from '@/features/deployments/api/deployments.service';
import { containersService } from '@/features/registry/api/containers.service';
import { environmentsService } from '@/features/projects/api/environments.service';
import { useProjectServices } from '@/features/projects/api/use-project-services';
import { useProjectDeployments } from '@/features/projects/api/use-project-deployments';
import { useProjectEnvironments } from '@/features/projects/api/use-project-environments';
import { DeployDialog } from '@/features/deployments/components/deploy-dialog';
import { DeploymentStatusBadge } from '@/features/deployments/components/deployment-status-badge';
import { ProjectDeploymentsTab } from '@/features/projects/components/project-deployments-tab';
import { PageHeader } from '@/shared/layout/page-header';
import { SectionCard } from '@/shared/layout/section-card';
import { ServiceConfigForm } from '@/features/projects/components/tabs/service/service-config-form';
import { ServiceWebhook } from '@/features/projects/components/tabs/service/service-webhook';
import { ServiceCiGenerator } from '@/features/projects/components/tabs/service/service-ci-generator';
import { ServiceTerminalDialog } from '@/features/projects/components/tabs/service/service-terminal-dialog';
import { ServiceDomains } from '@/features/projects/components/tabs/service/service-domains';
import { ServicePipelines } from '@/features/projects/components/tabs/service/service-pipelines';
import { ServiceMonitoring } from '@/features/projects/components/tabs/service/service-monitoring';
import { ServiceMetricsChart } from '@/features/projects/components/tabs/service/service-metrics-chart';
import { ServiceLogs } from '@/features/projects/components/tabs/service/service-logs';
import { ServiceEnvironments } from '@/features/projects/components/tabs/service/service-environments';
import { resolveDeploymentUrl } from '@/features/deployments/utils';
import type { Service } from '@/features/projects/types/service';
import type { Deployment } from '@/features/deployments/types';

type Tab =
  | 'general'
  | 'cicd'
  | 'environnements'
  | 'domains'
  | 'webhooks'
  | 'deployments'
  | 'monitoring'
  | 'logs';
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'cicd', label: 'CI/CD', icon: GitPullRequestArrow },
  { id: 'environnements', label: 'Environnements', icon: Layers },
  { id: 'domains', label: 'Domains', icon: Globe },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
  { id: 'deployments', label: 'Deployments', icon: Activity },
  { id: 'monitoring', label: 'Monitoring', icon: ContainerIcon },
  { id: 'logs', label: 'Logs', icon: ScrollText },
];

export default function ServiceDetailPage({ params }: { params: Promise<{ id: string; serviceId: string }> }) {
  const { id: projectId, serviceId } = use(params);
  const router = useRouter();
  const confirm = useConfirm();

  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<Tab>('general');
  const [deployOpen, setDeployOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [redeploying, setRedeploying] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedEnvId, setSelectedEnvId] = useState<string>('');

  // Data via React Query (cohérent avec la page projet ; le cache est partagé,
  // donc naviguer projet → service réutilise les listes déjà chargées).
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

  // Sélecteur d'environnement cible : défaut = 1er env une fois chargé.
  useEffect(() => {
    const first = environmentsQuery.data?.[0]?.id;
    if (first) setSelectedEnvId((prev) => prev || first);
  }, [environmentsQuery.data]);

  const lastDeployment = deployments[0] ?? null;
  const appUrl = lastDeployment ? resolveDeploymentUrl(lastDeployment) : null;
  const isDatabase = service?.type === 'DATABASE';

  // Redeploy 1-clic : relance le service sur l'environnement sélectionné sans
  // rouvrir le dialog. On résout le ServiceEnvironment (service × env) via les
  // service-links ; à défaut (service non lié), on retombe sur le dialog.
  const handleRedeploy = async () => {
    const envId = selectedEnvId || environments[0]?.id;
    if (!envId) { setDeployOpen(true); return; }
    setRedeploying(true); setNotice(null);
    try {
      const links = await environmentsService.getServiceLinks(projectId, envId);
      const link = links.find((l) => l.serviceId === serviceId);
      if (!link) {
        setNotice('Service non lié à cet environnement — ouverture du dialog.');
        setDeployOpen(true);
        return;
      }
      await deploymentsService.create({ serviceEnvId: link.id, branch: lastDeployment?.branch ?? undefined });
      setNotice('Redeploy started.');
      reload();
    } catch (e) {
      setNotice(getApiErrorMessage(e));
    } finally {
      setRedeploying(false);
    }
  };

  const handleStop = async () => {
    setStopping(true); setNotice(null);
    try {
      const containers = await containersService.listByService(serviceId);
      const running = containers.find((c) => c.status === 'RUNNING') ?? containers[0];
      if (!running) { setNotice('No running container found for this service.'); return; }
      await containersService.stop(running.id);
      setNotice('Container stopped.');
      reload();
    } catch (e) {
      setNotice(getApiErrorMessage(e));
    } finally {
      setStopping(false);
    }
  };

  const handleDelete = async () => {
    if (!service) return;
    const ok = await confirm({
      title: `Supprimer le service "${service.name}" ?`,
      description: 'Le service est archivé (l\'historique des déploiements est conservé). Cette action le retire du projet.',
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    setDeleting(true); setNotice(null);
    try {
      await servicesService.remove(projectId, serviceId);
      router.push(`/projects/${projectId}`);
    } catch (e) {
      setNotice(getApiErrorMessage(e));
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-[var(--text-secondary)]"><Loader2 size={15} className="animate-spin" /> Loading service…</div>;
  }
  if (error || !service) {
    return <div className="p-6 text-sm text-red-400">{error ?? 'Service not found.'}</div>;
  }

  const TypeIcon = isDatabase ? Database : service.sourceType === 'DOCKER_IMAGE' ? ContainerIcon : FolderGit2;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Service"
        title={service.name}
        description={
          isDatabase
            ? `${service.databaseType ?? 'Database'} · ${service.databaseVersion ?? 'latest'}`
            : service.repoPath ?? service.repoUrl ?? service.sourceType ?? 'Application'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {lastDeployment && <DeploymentStatusBadge status={lastDeployment.status} variant="plain" />}
            {environments.length > 0 && (
              <label className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                <Layers size={14} />
                <select
                  value={selectedEnvId}
                  onChange={(e) => setSelectedEnvId(e.target.value)}
                  className="bg-transparent text-[var(--text-primary)] outline-none"
                  aria-label="Environnement cible"
                >
                  {environments.map((env) => (
                    <option key={env.id} value={env.id}>{env.name}</option>
                  ))}
                </select>
              </label>
            )}
            <Link href={`/projects/${projectId}`} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
              <ArrowLeft size={14} /> Project
            </Link>
            <button type="button" onClick={() => void handleDelete()} disabled={deleting}
              title="Supprimer ce service"
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50">
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
            </button>
          </div>
        }
      />

      {/* Deploy bar — actions principales, persistantes au-dessus des onglets (S1) */}
      {!isDatabase && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
          <button type="button" onClick={() => setDeployOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90">
            <Rocket size={15} /> Deploy
          </button>
          <button type="button" onClick={() => void handleRedeploy()} disabled={redeploying}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover)] disabled:opacity-50">
            {redeploying ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Redeploy
          </button>
          <button type="button" onClick={() => void handleStop()} disabled={stopping}
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50">
            {stopping ? <Loader2 size={15} className="animate-spin" /> : <StopCircle size={15} />} Stop
          </button>
          <button type="button" onClick={() => setTerminalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover)]">
            <TerminalSquare size={15} /> Open terminal
          </button>
          {lastDeployment && (
            <div className="ml-auto flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <DeploymentStatusBadge status={lastDeployment.status} variant="plain" />
              {appUrl && (
                <a href={appUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover)]">
                  <Globe size={12} /> Open app
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-[var(--border)]">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map(({ id: tid, label, icon: Icon }) => (
            <button key={tid} type="button" onClick={() => setTab(tid)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${tab === tid ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>
      </div>

      {notice && <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-2.5 text-sm text-[var(--text-secondary)]">{notice}</div>}

      {/* General */}
      {tab === 'general' && (
        <div className="space-y-4">
          {isDatabase ? (
            <SectionCard title="Database" description="Engine and connection details for this managed database.">
              <div className="flex items-center gap-2">
                <TypeIcon size={18} className="text-[var(--text-secondary)]" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {service.databaseType} {service.databaseVersion ?? ''}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                {service.port != null && <Field k="Port" v={String(service.port)} />}
              </dl>
            </SectionCard>
          ) : (
            <ServiceConfigForm projectId={projectId} service={service} onSaved={() => reload()} />
          )}
        </div>
      )}

      {/* CI/CD — générateur (Dockerfile + .dockerignore + fichier CI) + runs pipeline */}
      {tab === 'cicd' && (
        <div className="space-y-4">
          {!isDatabase && (
            <ServiceCiGenerator projectId={projectId} serviceId={serviceId} />
          )}
          <ServicePipelines projectId={projectId} serviceId={serviceId} branch={service?.branch ?? null} />
        </div>
      )}

      {/* Webhooks (onglet séparé — gère le webhook de déploiement) */}
      {tab === 'webhooks' && (
        <ServiceWebhook projectId={projectId} serviceId={serviceId} />
      )}

      {/* Environnements (liens service↔env + variables/secrets par env) */}
      {tab === 'environnements' && (
        <ServiceEnvironments
          projectId={projectId}
          serviceId={serviceId}
          environments={environments}
          envLinks={service.envLinks ?? []}
          onChanged={() => reload()}
        />
      )}

      {/* Domains */}
      {tab === 'domains' && (
        <ServiceDomains
          projectId={projectId}
          serviceEnvId={service.envLinks?.find((l) => l.environmentId === (selectedEnvId || environments[0]?.id))?.id ?? null}
          envName={environments.find((e) => e.id === (selectedEnvId || environments[0]?.id))?.name}
        />
      )}

      {/* Deployments — historique + logs par déploiement (en dialog) */}
      {tab === 'deployments' && (
        <ProjectDeploymentsTab
          deployments={deployments}
          loading={loading}
          error={error}
          projectId={projectId}
          onRefresh={() => reload()}
        />
      )}

      {/* Monitoring : stats live + historique (courbes + marqueurs de déploiement) */}
      {tab === 'monitoring' && (
        <div className="space-y-4">
          <ServiceMonitoring deploymentId={lastDeployment?.id ?? null} />
          <ServiceMetricsChart
            serviceEnvId={
              service.envLinks?.find(
                (l) => l.environmentId === (selectedEnvId || environments[0]?.id),
              )?.id ?? null
            }
            deployments={deployments}
          />
        </div>
      )}

      {/* Logs : recherche historique centralisée (Loki) par période */}
      {tab === 'logs' && (
        <ServiceLogs
          serviceEnvId={
            service.envLinks?.find(
              (l) => l.environmentId === (selectedEnvId || environments[0]?.id),
            )?.id ?? null
          }
        />
      )}

      <DeployDialog
        projectId={projectId}
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        onCreated={() => { setDeployOpen(false); reload(); }}
        services={services}
        initialServiceId={serviceId}
        initialEnvironmentId={selectedEnvId || undefined}
      />

      <ServiceTerminalDialog
        projectId={projectId}
        envId={selectedEnvId || environments[0]?.id || null}
        envName={environments.find((e) => e.id === (selectedEnvId || environments[0]?.id))?.name}
        open={terminalOpen}
        onClose={() => setTerminalOpen(false)}
      />
    </div>
  );
}
function Field({ k, v, mono, icon }: { k: string; v: string; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{k}</dt>
      <dd className={`mt-0.5 flex items-center gap-1 truncate text-[var(--text-primary)] ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{icon}{v}</dd>
    </div>
  );
}
