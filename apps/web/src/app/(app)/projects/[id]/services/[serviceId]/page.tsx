'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  Container as ContainerIcon,
  Database,
  FolderGit2,
  GitBranch,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  ScrollText,
  Settings2,
  StopCircle,
  TerminalSquare,
} from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api';
import { servicesService } from '@/services/services.service';
import { deploymentsService } from '@/services/deployments.service';
import { containersService } from '@/services/containers.service';
import { monitoringService, type ContainerInfo } from '@/services/monitoring.service';
import { DeployDialog } from '@/components/deployments/deploy-dialog';
import { DeploymentStatusBadge } from '@/components/deployments/deployment-status-badge';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import type { Service } from '@/types/extended/service';
import type { Deployment } from '@/types/deployment';

type Tab = 'general' | 'environment' | 'logs' | 'deployments' | 'monitoring';
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'environment', label: 'Environment', icon: ScrollText },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'deployments', label: 'Deployments', icon: Activity },
  { id: 'monitoring', label: 'Monitoring', icon: ContainerIcon },
];

export default function ServiceDetailPage({ params }: { params: Promise<{ id: string; serviceId: string }> }) {
  const { id: projectId, serviceId } = use(params);

  const [service, setService] = useState<Service | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('general');
  const [deployOpen, setDeployOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, deps] = await Promise.all([
        servicesService.getAll(projectId),
        deploymentsService.getByProject(projectId),
      ]);
      setServices(all);
      setService(all.find((s) => s.id === serviceId) ?? null);
      setDeployments(deps.filter((d) => d.serviceId === serviceId));
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, serviceId]);

  useEffect(() => { void load(); }, [load]);

  const lastDeployment = deployments[0] ?? null;
  const isDatabase = service?.type === 'DATABASE';

  const handleStop = async () => {
    setStopping(true); setNotice(null);
    try {
      const containers = await containersService.listByService(serviceId);
      const running = containers.find((c) => c.status === 'RUNNING') ?? containers[0];
      if (!running) { setNotice('No running container found for this service.'); return; }
      await containersService.stop(running.id);
      setNotice('Container stopped.');
      void load();
    } catch (e) {
      setNotice(getApiErrorMessage(e));
    } finally {
      setStopping(false);
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
            : service.repoUrl ?? service.sourceType ?? 'Application'
        }
        actions={
          <Link href={`/projects/${projectId}`} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
            <ArrowLeft size={14} /> Project
          </Link>
        }
      />

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
          <SectionCard title="Deploy settings" description="Deploy, redeploy, stop or open a shell on the target server.">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setDeployOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90">
                <Rocket size={15} /> Deploy
              </button>
              <button type="button" onClick={() => setDeployOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover)]">
                <RefreshCw size={15} /> Redeploy
              </button>
              <button type="button" onClick={() => void handleStop()} disabled={stopping}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50">
                {stopping ? <Loader2 size={15} className="animate-spin" /> : <StopCircle size={15} />} Stop
              </button>
              <Link href="/terminal"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover)]">
                <TerminalSquare size={15} /> Open terminal
              </Link>
            </div>
            {lastDeployment && (
              <div className="mt-4 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span>Last deployment:</span>
                <DeploymentStatusBadge status={lastDeployment.status} />
                <Link href={`/deployments/${lastDeployment.id}`} className="text-xs underline hover:text-[var(--text-primary)]">view</Link>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Provider" description="Where this service's code or image comes from.">
            <div className="flex items-center gap-2">
              <TypeIcon size={18} className="text-[var(--text-secondary)]" />
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {isDatabase ? `${service.databaseType} ${service.databaseVersion ?? ''}` : service.sourceType === 'DOCKER_IMAGE' ? 'Docker image' : 'Git repository'}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {service.repoUrl && <Field k="Repository" v={service.repoUrl} mono />}
              {service.branch && <Field k="Branch" v={service.branch} icon={<GitBranch size={11} />} />}
              {service.buildPack && <Field k="Build pack" v={service.buildPack} />}
              {service.port != null && <Field k="Port" v={String(service.port)} />}
              {service.startCommand && <Field k="Start command" v={service.startCommand} mono />}
            </dl>
          </SectionCard>
        </div>
      )}

      {/* Environment */}
      {tab === 'environment' && (
        <SectionCard title="Environment variables" description="Variables are configured per environment.">
          <p className="text-sm text-[var(--text-secondary)]">
            This service&apos;s variables are managed per environment.{' '}
            <Link href={`/projects/${projectId}?tab=environments`} className="underline hover:text-[var(--text-primary)]">
              Open the Environments tab
            </Link>{' '}
            to edit non-secret config and encrypted secrets for each target.
          </p>
        </SectionCard>
      )}

      {/* Logs */}
      {tab === 'logs' && <ServiceLogs deploymentId={lastDeployment?.id ?? null} />}

      {/* Deployments */}
      {tab === 'deployments' && (
        <SectionCard title="Deployments" description="History for this service.">
          {deployments.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No deployments yet.</p>
          ) : (
            <ul className="space-y-2">
              {deployments.map((d) => (
                <li key={d.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <DeploymentStatusBadge status={d.status} />
                    <code className="text-xs text-[var(--text-secondary)]">{d.branch}</code>
                    <span className="text-xs text-[var(--text-muted)]">{d.environment?.name}</span>
                  </span>
                  <Link href={`/deployments/${d.id}`} className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">view →</Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {/* Monitoring */}
      {tab === 'monitoring' && <ServiceMonitoring deploymentId={lastDeployment?.id ?? null} />}

      <DeployDialog
        projectId={projectId}
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        onCreated={() => { setDeployOpen(false); void load(); }}
        services={services}
        initialServiceId={serviceId}
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

function ServiceLogs({ deploymentId }: { deploymentId: string | null }) {
  const [logs, setLogs] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!deploymentId) return;
    setLoading(true); setError(null);
    try { setLogs(await deploymentsService.getContainerLogs(deploymentId)); }
    catch (e) { setError(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, [deploymentId]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  return (
    <SectionCard title="Container logs" description="Live logs from the latest deployment's container.">
      {!deploymentId ? (
        <p className="text-sm text-[var(--text-muted)]">No deployment yet.</p>
      ) : (
        <div className="space-y-2">
          <button type="button" onClick={() => void fetchLogs()} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <pre className="max-h-96 overflow-auto rounded-xl border border-[var(--border)] bg-black/60 p-4 font-mono text-xs leading-relaxed text-green-300 whitespace-pre-wrap">{logs ?? '# No logs available'}</pre>
        </div>
      )}
    </SectionCard>
  );
}

function ServiceMonitoring({ deploymentId }: { deploymentId: string | null }) {
  const [info, setInfo] = useState<ContainerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInfo = useCallback(async () => {
    if (!deploymentId) return;
    setLoading(true); setError(null);
    try { setInfo(await monitoringService.getContainerInfo(deploymentId, 0)); }
    catch (e) { setError(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, [deploymentId]);

  useEffect(() => { void fetchInfo(); }, [fetchInfo]);

  if (!deploymentId) return <SectionCard title="Monitoring"><p className="text-sm text-[var(--text-muted)]">No deployment yet.</p></SectionCard>;

  return (
    <SectionCard title="Container metrics" description="Real-time stats for the running container.">
      <div className="space-y-3">
        <button type="button" onClick={() => void fetchInfo()} disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {info && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat k="Status" v={info.status} />
            {info.stats && <><Stat k="CPU" v={info.stats.cpuPercent} /><Stat k="Memory" v={info.stats.memPercent} /><Stat k="Net I/O" v={info.stats.netIO} /></>}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{k}</p>
      <p className="mt-1 font-mono text-sm font-bold capitalize text-[var(--text-primary)]">{v}</p>
    </div>
  );
}
