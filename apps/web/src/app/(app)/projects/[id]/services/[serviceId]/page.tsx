'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  ChevronDown,
  Container as ContainerIcon,
  Database,
  FolderGit2,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  ScrollText,
  Settings2,
  StopCircle,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api';
import { useConfirm } from '@/contexts/confirm-context';
import { servicesService } from '@/services/services.service';
import { deploymentsService } from '@/services/deployments.service';
import { containersService } from '@/services/containers.service';
import { environmentsService } from '@/services/environments.service';
import { monitoringService, type ContainerInfo } from '@/services/monitoring.service';
import { DeployDialog } from '@/components/deployments/deploy-dialog';
import { DeploymentStatusBadge } from '@/components/deployments/deployment-status-badge';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { ServiceConfigForm } from '@/components/projects/tabs/service/service-config-form';
import { LogTerminal } from '@/components/log-terminal';
import { useDeploymentSocket } from '@/hooks/deployments/use-deployment-socket';
import type { Service } from '@/types/service';
import type { Deployment, DeploymentStatus } from '@/types/deployment';

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
  const router = useRouter();
  const confirm = useConfirm();

  const [service, setService] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('general');
  const [deployOpen, setDeployOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [redeploying, setRedeploying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [environments, setEnvironments] = useState<{ id: string; name: string }[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, deps, envs] = await Promise.all([
        servicesService.getAll(projectId),
        deploymentsService.getByProject(projectId),
        environmentsService.getAll(projectId),
      ]);
      setServices(all);
      setService(all.find((s) => s.id === serviceId) ?? null);
      setDeployments(deps.filter((d) => d.serviceId === serviceId));
      setEnvironments(envs.map((e) => ({ id: e.id, name: e.name })));
      setSelectedEnvId((prev) => prev || envs[0]?.id || '');
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, serviceId]);

  useEffect(() => { void load(); }, [load]);

  const lastDeployment = deployments[0] ?? null;
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
      setNotice('Redeploy lancé.');
      void load();
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
      void load();
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
            {lastDeployment && <DeploymentStatusBadge status={lastDeployment.status} />}
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
              <button type="button" onClick={() => void handleRedeploy()} disabled={redeploying}
                title={lastDeployment ? 'Relancer le dernier déploiement' : 'Aucun déploiement précédent — ouvre le dialog'}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover)] disabled:opacity-50">
                {redeploying ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Redeploy
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
            <ServiceConfigForm projectId={projectId} service={service} onSaved={() => void load()} />
          )}
        </div>
      )}

      {/* Environment */}
      {tab === 'environment' && (
        <ServiceEnvironments
          projectId={projectId}
          serviceId={serviceId}
          environments={environments}
          envLinks={service.envLinks ?? []}
          onChanged={() => void load()}
        />
      )}

      {/* Logs */}
      {tab === 'logs' && <ServiceLogs deploymentId={lastDeployment?.id ?? null} initialStatus={lastDeployment?.status ?? null} />}

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
        initialEnvironmentId={selectedEnvId || undefined}
      />
    </div>
  );
}

/**
 * Sélecteur d'environnements DU service : choisir dans quels environnements ce
 * service est déployable. Chaque lien = un ServiceEnvironment (service × env),
 * l'unité déployable. Résout le cas « env créé après le service » (pas d'auto-lien).
 */
function ServiceEnvironments({
  projectId,
  serviceId,
  environments,
  envLinks,
  onChanged,
}: {
  projectId: string;
  serviceId: string;
  environments: { id: string; name: string }[];
  envLinks: { id: string; environmentId: string }[];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null); // serviceEnvId déplié

  const linkFor = (envId: string) => envLinks.find((l) => l.environmentId === envId) ?? null;

  const toggle = async (envId: string) => {
    setBusyId(envId); setError(null);
    try {
      const link = linkFor(envId);
      if (link) {
        await environmentsService.unlinkService(projectId, link.id);
      } else {
        await environmentsService.linkService(projectId, envId, serviceId);
      }
      onChanged();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SectionCard
      title="Environments & variables"
      description="Ce service tourne dans chaque environnement lié (1 lien = 1 instance déployable). Chaque instance a SES propres variables."
    >
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      {environments.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Aucun environnement — créez-en un dans l&apos;onglet{' '}
          <Link href={`/projects/${projectId}?tab=environments`} className="underline hover:text-[var(--text-primary)]">
            Environments
          </Link>{' '}
          du projet.
        </p>
      ) : (
        <div className="space-y-2">
          {environments.map((env) => {
            const link = linkFor(env.id);
            const linked = !!link;
            const busy = busyId === env.id;
            const isOpen = !!link && openId === link.id;
            return (
              <div key={env.id} className="overflow-hidden rounded-lg border border-[var(--border)]">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <Layers size={14} className="text-[var(--text-muted)]" />
                    <span className="font-medium text-[var(--text-primary)]">{env.name}</span>
                    {linked && (
                      <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">Lié</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {linked && link && (
                      <button type="button" onClick={() => setOpenId(isOpen ? null : link.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
                        <ChevronDown size={12} className={isOpen ? 'rotate-180 transition' : 'transition'} /> Variables
                      </button>
                    )}
                    <button type="button" onClick={() => void toggle(env.id)} disabled={busy}
                      className={linked
                        ? 'inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50'
                        : 'inline-flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50'}>
                      {busy ? <Loader2 size={12} className="animate-spin" /> : linked ? <X size={12} /> : <Plus size={12} />}
                      {linked ? 'Détacher' : 'Ajouter à cet environnement'}
                    </button>
                  </div>
                </div>
                {isOpen && link && <EnvVarsEditor projectId={projectId} serviceEnvId={link.id} />}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

/** Éditeur des variables d'UNE instance (ServiceEnvironment = service × env). */
function EnvVarsEditor({ projectId, serviceEnvId }: { projectId: string; serviceEnvId: string }) {
  const [env, setEnv] = useState('');
  const [secrets, setSecrets] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    environmentsService.getServiceLink(projectId, serviceEnvId)
      .then((se) => {
        if (!alive) return;
        const raw = se.env as unknown;
        setEnv(typeof raw === 'string' ? raw : raw ? JSON.stringify(raw, null, 2) : '');
      })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId, serviceEnvId]);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const payload: { env?: string; secretsEnv?: string } = {};
      if (env.trim()) { JSON.parse(env); payload.env = env; } else { payload.env = '{}'; }
      if (secrets.trim()) { JSON.parse(secrets); payload.secretsEnv = secrets; }
      await environmentsService.updateServiceLink(projectId, serviceEnvId, payload);
      setMsg('Enregistré ✓'); setSecrets('');
    } catch (e) {
      setMsg(e instanceof SyntaxError ? 'JSON invalide.' : getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const ta = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]';
  const lbl = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]';

  return (
    <div className="space-y-3 border-t border-[var(--border)] bg-[var(--bg-app)]/40 px-3 py-3">
      {loading ? (
        <p className="text-xs text-[var(--text-muted)]">Chargement…</p>
      ) : (
        <>
          <div>
            <label className={lbl}>Variables (JSON)</label>
            <textarea rows={5} value={env} onChange={(e) => setEnv(e.target.value)}
              placeholder={'{\n  "NODE_ENV": "production"\n}'} className={ta} />
          </div>
          <div>
            <label className={lbl}>Secrets (JSON · chiffrés au repos · écriture seule)</label>
            <textarea rows={3} value={secrets} onChange={(e) => setSecrets(e.target.value)}
              placeholder={'{ "DB_PASSWORD": "..." }  — laisser vide pour ne pas changer'} className={ta} />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void save()} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Enregistrer
            </button>
            {msg && <span className="text-xs text-[var(--text-secondary)]">{msg}</span>}
          </div>
        </>
      )}
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

function ServiceLogs({ deploymentId, initialStatus }: { deploymentId: string | null; initialStatus: DeploymentStatus | null }) {
  const [initialLogs, setInitialLogs] = useState<string | null>(null);

  useEffect(() => {
    if (!deploymentId) return;
    let alive = true;
    deploymentsService.getById(deploymentId)
      .then((d) => { if (alive) setInitialLogs((d as { logs?: string | null }).logs ?? null); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [deploymentId]);

  // Flux WebSocket en direct : pendant un déploiement actif les lignes arrivent
  // en temps réel ; sinon le hook rejoue les logs bufferisés du dernier déploiement.
  const { logs, status } = useDeploymentSocket({
    deploymentId: deploymentId ?? '',
    enabled: !!deploymentId,
    initialLogs,
    initialStatus,
  });
  const isLive = status === 'PENDING' || status === 'RUNNING';

  return (
    <SectionCard title="Logs du déploiement" description="Flux en direct du dernier déploiement (build, run, health-check, route).">
      {!deploymentId ? (
        <p className="text-sm text-[var(--text-muted)]">Aucun déploiement.</p>
      ) : (
        <LogTerminal logs={logs} isLive={isLive} />
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
