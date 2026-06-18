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
  GitPullRequestArrow,
  Globe,
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
import { ProjectDeploymentsTab } from '@/components/projects/project-deployments-tab';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { ServiceConfigForm } from '@/components/projects/tabs/service/service-config-form';
import { ServiceWebhook } from '@/components/projects/tabs/service/service-webhook';
import { ServiceCiGenerator } from '@/components/projects/tabs/service/service-ci-generator';
import { ServiceTerminalDialog } from '@/components/projects/tabs/service/service-terminal-dialog';
import { ServiceDomains } from '@/components/projects/tabs/service/service-domains';
import { ServicePipelines } from '@/components/projects/tabs/service/service-pipelines';
import { LogTerminal } from '@/components/log-terminal';
import { resolveDeploymentUrl } from '@/lib/deployment-utils';
import { useDeploymentSocket } from '@/hooks/deployments/use-deployment-socket';
import type { Service } from '@/types/service';
import type { Deployment, DeploymentStatus } from '@/types/deployment';

type Tab = 'general' | 'variables' | 'domains' | 'webhooks' | 'logs' | 'deployments' | 'pipelines' | 'monitoring';
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'variables', label: 'Variables', icon: ScrollText },
  { id: 'domains', label: 'Domains', icon: Globe },
  { id: 'webhooks', label: 'Webhooks', icon: GitPullRequestArrow },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'deployments', label: 'Deployments', icon: Activity },
  { id: 'pipelines', label: 'Pipelines', icon: GitPullRequestArrow },
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
  const [terminalOpen, setTerminalOpen] = useState(false);
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
            <>
              <ServiceConfigForm projectId={projectId} service={service} onSaved={() => void load()} />
              <ServiceCiGenerator projectId={projectId} serviceId={serviceId} />
            </>
          )}
        </div>
      )}

      {/* Webhooks (intégration CI/CD) */}
      {tab === 'webhooks' && (
        <ServiceWebhook projectId={projectId} serviceId={serviceId} />
      )}

      {/* Variables & environnements (ex-onglet Environment) */}
      {tab === 'variables' && (
        <ServiceEnvironments
          projectId={projectId}
          serviceId={serviceId}
          environments={environments}
          envLinks={service.envLinks ?? []}
          onChanged={() => void load()}
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

      {/* Logs */}
      {tab === 'logs' && <ServiceLogs deploymentId={lastDeployment?.id ?? null} initialStatus={lastDeployment?.status ?? null} />}

      {/* Deployments — même UI que l'onglet projet (logs/container/rollback en dialog) */}
      {tab === 'deployments' && (
        <ProjectDeploymentsTab
          deployments={deployments}
          loading={loading}
          error={error}
          projectId={projectId}
          onRefresh={() => void load()}
        />
      )}

      {/* Pipelines (CI/CD) */}
      {tab === 'pipelines' && (
        <ServicePipelines projectId={projectId} serviceId={serviceId} branch={service?.branch ?? null} />
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
type KV = { key: string; value: string };
function kvFromRaw(raw: unknown): KV[] {
  let obj: Record<string, unknown> = {};
  if (typeof raw === 'string' && raw.trim()) {
    try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  }
  return Object.entries(obj).map(([key, value]) => ({ key, value: String(value ?? '') }));
}
function kvToJson(rows: KV[]): string {
  const o: Record<string, string> = {};
  for (const r of rows) { const k = r.key.trim(); if (k) o[k] = r.value; }
  return JSON.stringify(o);
}

/** Lignes KEY=value (ajouter/supprimer). `secret` masque les valeurs. */
function KvRows({ rows, setRows, secret }: { rows: KV[]; setRows: (r: KV[]) => void; secret?: boolean }) {
  const inputCls = 'rounded-md border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]';
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input value={r.key} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
            placeholder="KEY" className={`${inputCls} w-1/3`} />
          <span className="text-[var(--text-muted)]">=</span>
          <input value={r.value} type={secret ? 'password' : 'text'}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
            placeholder="value" className={`${inputCls} flex-1`} />
          <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:text-red-400">
            <X size={12} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { key: '', value: '' }])}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
        <Plus size={11} /> Ajouter une variable
      </button>
    </div>
  );
}

function EnvVarsEditor({ projectId, serviceEnvId }: { projectId: string; serviceEnvId: string }) {
  const [vars, setVars] = useState<KV[]>([]);
  const [secrets, setSecrets] = useState<KV[]>([]);
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [autoBranch, setAutoBranch] = useState('main');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    environmentsService.getServiceLink(projectId, serviceEnvId)
      .then((se) => {
        if (!alive) return;
        setVars(kvFromRaw(se.env as unknown));
        setAutoDeploy(!!se.autoDeploy);
        setAutoBranch(se.autoBranch ?? 'main');
      })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId, serviceEnvId]);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const payload: { env?: string; secretsEnv?: string; autoDeploy?: boolean; autoBranch?: string } = {
        autoDeploy,
        autoBranch: autoBranch.trim() || 'main',
        env: kvToJson(vars),
      };
      const secretRows = secrets.filter((s) => s.key.trim());
      if (secretRows.length) payload.secretsEnv = kvToJson(secretRows);
      await environmentsService.updateServiceLink(projectId, serviceEnvId, payload);
      setMsg('Enregistré ✓'); setSecrets([]);
    } catch (e) {
      setMsg(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const lbl = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]';

  return (
    <div className="space-y-3 border-t border-[var(--border)] bg-[var(--bg-app)]/40 px-3 py-3">
      {loading ? (
        <p className="text-xs text-[var(--text-muted)]">Chargement…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
            <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input type="checkbox" checked={autoDeploy} onChange={(e) => setAutoDeploy(e.target.checked)} />
              Auto-deploy sur push
            </label>
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              branche
              <input value={autoBranch} onChange={(e) => setAutoBranch(e.target.value)} placeholder="main" disabled={!autoDeploy}
                className="w-32 rounded-md border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none disabled:opacity-50" />
            </span>
          </div>
          <div>
            <label className={lbl}>Variables</label>
            <KvRows rows={vars} setRows={setVars} />
          </div>
          <div>
            <label className={lbl}>Secrets (chiffrés au repos · écriture seule)</label>
            <KvRows rows={secrets} setRows={setSecrets} secret />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">Laisser vide pour ne pas changer les secrets existants.</p>
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
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);

  const fetchInfo = useCallback(async () => {
    if (!deploymentId) return;
    try { setInfo(await monitoringService.getContainerInfo(deploymentId, 0)); setError(null); }
    catch (e) { setError(getApiErrorMessage(e)); }
  }, [deploymentId]);

  useEffect(() => { void fetchInfo(); }, [fetchInfo]);
  // Rafraîchissement LIVE toutes les 5s (CPU/Mém/Net en temps réel).
  useEffect(() => {
    if (!live || !deploymentId) return;
    const t = setInterval(() => { void fetchInfo(); }, 5000);
    return () => clearInterval(t);
  }, [live, deploymentId, fetchInfo]);

  if (!deploymentId) return <SectionCard title="Monitoring"><p className="text-sm text-[var(--text-muted)]">No deployment yet.</p></SectionCard>;

  const running = info?.status === 'running';
  return (
    <SectionCard title="Container metrics" description="Stats temps réel du conteneur (rafraîchies toutes les 5s).">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setLive((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${live ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-green-400' : 'bg-[var(--text-muted)]'}`} />
            {live ? 'Live' : 'En pause'}
          </button>
          <button type="button" onClick={() => void fetchInfo()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {info && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat k="Status" v={info.status} />
            <Stat k="CPU" v={info.stats?.cpuPercent ?? '—'} />
            <Stat k="Memory" v={info.stats?.memPercent ?? '—'} />
            <Stat k="Net I/O" v={info.stats?.netIO ?? '—'} />
          </div>
        )}
        {info && !info.stats && (
          <p className="text-xs text-[var(--text-muted)]">
            {running ? 'Métriques en cours de collecte…' : 'Conteneur non démarré — métriques indisponibles.'}
          </p>
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
