'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Boxes,
  Check,
  Container,
  Database,
  FolderGit2,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/lib/api';
import { projectsService } from '@/services/projects.service';
import { servicesService } from '@/services/services.service';
import type { SourceProviderOption } from '@/types/project';
import type {
  BuildPack,
  CreateServicePayload,
  DiscoveredRepo,
  ManagedServiceType,
} from '@/types/extended/service';

/* ─── Catalog ───────────────────────────────────────────────────────────── */

type ServiceKind = 'REPO' | 'GROUP' | 'DATABASE' | 'DOCKER';

const KINDS: { kind: ServiceKind; label: string; hint: string; icon: React.ReactNode }[] = [
  { kind: 'REPO', label: 'Git repository', hint: 'Deploy a single repo (GitLab / GitHub / Gitea)', icon: <FolderGit2 size={20} /> },
  { kind: 'GROUP', label: 'Git group', hint: 'Discover a group/org and add several repos at once', icon: <Boxes size={20} /> },
  { kind: 'DATABASE', label: 'Database', hint: 'PostgreSQL, MySQL, Redis, MongoDB, RabbitMQ', icon: <Database size={20} /> },
  { kind: 'DOCKER', label: 'Docker image', hint: 'Deploy a prebuilt image from a registry', icon: <Container size={20} /> },
];

const DATABASES: { type: ManagedServiceType; label: string; defaultVersion: string }[] = [
  { type: 'POSTGRES', label: 'PostgreSQL', defaultVersion: '16' },
  { type: 'MYSQL', label: 'MySQL', defaultVersion: '8' },
  { type: 'REDIS', label: 'Redis', defaultVersion: '7' },
  { type: 'MONGODB', label: 'MongoDB', defaultVersion: '7' },
  { type: 'RABBITMQ', label: 'RabbitMQ', defaultVersion: '3' },
];

const BUILD_PACKS: BuildPack[] = ['NIXPACKS', 'DOCKERFILE', 'STATIC', 'BUILDPACK'];

function repoToName(repoPath: string): string {
  const seg = repoPath.trim().replace(/\/+$/, '').split('/').pop() ?? '';
  return seg || repoPath.trim();
}

type Step = 1 | 2 | 3;
type Props = { projectId: string; open: boolean; onClose: () => void; onCreated: () => void };

/* ─── Wizard ────────────────────────────────────────────────────────────── */

export function AddServiceWizard({ projectId, open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [kind, setKind] = useState<ServiceKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [providers, setProviders] = useState<SourceProviderOption[]>([]);
  const [providerId, setProviderId] = useState('');

  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [branch, setBranch] = useState('main');
  const [buildPack, setBuildPack] = useState<BuildPack>('NIXPACKS');
  const [port, setPort] = useState('3000');

  const [groupPath, setGroupPath] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredRepo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [databaseType, setDatabaseType] = useState<ManagedServiceType>('POSTGRES');
  const [databaseVersion, setDatabaseVersion] = useState('16');
  const [image, setImage] = useState('');

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === providerId) ?? null,
    [providers, providerId],
  );

  const reset = useCallback(() => {
    setStep(1); setKind(null); setError(null); setSubmitting(false);
    setName(''); setToken(''); setRepoPath(''); setBranch('main');
    setBuildPack('NIXPACKS'); setPort('3000'); setGroupPath('');
    setDiscovered([]); setSelected(new Set());
    setDatabaseType('POSTGRES'); setDatabaseVersion('16'); setImage('');
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    projectsService
      .getSourceProviders()
      .then((list) => {
        setProviders(list);
        const def = list.find((p) => p.isDefault) ?? list[0];
        if (def) setProviderId(def.id);
      })
      .catch(() => setProviders([]));
  }, [open, reset]);

  if (!open) return null;

  const pickKind = (k: ServiceKind) => { setKind(k); setError(null); setStep(2); };

  const discover = async () => {
    if (!selectedProvider || !groupPath.trim() || !token.trim()) {
      setError('Provider, group/org path and token are required.');
      return;
    }
    setDiscovering(true); setError(null);
    try {
      const repos = await servicesService.discoverGroup(projectId, {
        provider: selectedProvider.type as 'GITLAB' | 'GITHUB',
        groupPath: groupPath.trim(),
        token: token.trim(),
        providerId: selectedProvider.id,
      });
      setDiscovered(repos);
      setSelected(new Set(repos.map((r) => r.repoPath)));
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setDiscovering(false);
    }
  };

  const toggleRepo = (rp: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rp)) next.delete(rp); else next.add(rp);
      return next;
    });

  // Whether step 2 has enough to advance to review.
  const canReview = (() => {
    if (kind === 'REPO') return Boolean(selectedProvider && repoPath.trim() && token.trim());
    if (kind === 'GROUP') return selected.size > 0;
    if (kind === 'DATABASE') return name.trim().length > 0;
    if (kind === 'DOCKER') return Boolean(name.trim() && image.trim());
    return false;
  })();

  const submit = async () => {
    setError(null); setSubmitting(true);
    try {
      if (kind === 'REPO' && selectedProvider) {
        const provider = selectedProvider.type as 'GITLAB' | 'GITHUB';
        const payload: CreateServicePayload = {
          name: name.trim() || repoToName(repoPath),
          type: 'APPLICATION',
          sourceType: 'GIT',
          repoPath: repoPath.trim(),
          branch: branch.trim() || 'main',
          providerId: selectedProvider.id,
          buildPack,
          port: Number(port) || undefined,
          source: { provider, repoPath: repoPath.trim(), token: token.trim(), branch: branch.trim() || 'main' },
        };
        await servicesService.create(projectId, payload);
      } else if (kind === 'GROUP' && selectedProvider) {
        const provider = selectedProvider.type as 'GITLAB' | 'GITHUB';
        const repos = discovered.filter((r) => selected.has(r.repoPath));
        for (const repo of repos) {
          await servicesService.create(projectId, {
            name: repoToName(repo.repoPath),
            type: 'APPLICATION',
            sourceType: 'GIT',
            repoPath: repo.repoPath,
            branch: repo.defaultBranch || 'main',
            providerId: selectedProvider.id,
            buildPack,
            source: { provider, repoPath: repo.repoPath, token: token.trim(), branch: repo.defaultBranch || 'main' },
          });
        }
      } else if (kind === 'DATABASE') {
        await servicesService.create(projectId, {
          name: name.trim(),
          type: 'DATABASE',
          databaseType,
          databaseVersion: databaseVersion.trim() || 'latest',
        });
      } else if (kind === 'DOCKER') {
        await servicesService.create(projectId, {
          name: name.trim(),
          type: 'APPLICATION',
          sourceType: 'DOCKER_IMAGE',
          repoPath: image.trim(),
          buildPack: 'NONE',
          port: Number(port) || undefined,
        });
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const kindLabel = KINDS.find((k) => k.kind === kind)?.label ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        {/* Header + stepper */}
        <div className="border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Add service</p>
              <h2 className="mt-0.5 text-lg font-semibold text-[var(--text-primary)]">
                {step === 1 ? 'Choose a service type' : step === 2 ? `Configure ${kindLabel}` : 'Review & create'}
              </h2>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]">
              <X size={15} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-[var(--text-primary)]' : 'bg-[var(--border)]'}`} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</div>
          )}

          {/* Step 1 — type */}
          {step === 1 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {KINDS.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  onClick={() => pickKind(k.kind)}
                  className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-4 text-left transition hover:border-[var(--text-muted)] hover:bg-[var(--hover)]"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)]">{k.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">{k.label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{k.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2 — configure */}
          {step === 2 && kind === 'REPO' && (
            <div className="space-y-4">
              <ProviderSelect providers={providers} value={providerId} onChange={setProviderId} />
              <Input label="Repository path" placeholder="group/project or owner/repo" value={repoPath} onChange={(e) => setRepoPath(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
                <Input label="Port" value={port} onChange={(e) => setPort(e.target.value)} />
              </div>
              <BuildPackSelect value={buildPack} onChange={setBuildPack} />
              <Input label="Service name (optional)" placeholder={repoPath ? repoToName(repoPath) : 'api'} value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Access token (PAT)" type="password" placeholder="Required to read the repo" value={token} onChange={(e) => setToken(e.target.value)} />
            </div>
          )}

          {step === 2 && kind === 'GROUP' && (
            <div className="space-y-4">
              <ProviderSelect providers={providers} value={providerId} onChange={setProviderId} />
              <div className="flex items-end gap-2">
                <div className="flex-1"><Input label="Group / org path" placeholder="company/my-apps" value={groupPath} onChange={(e) => setGroupPath(e.target.value)} /></div>
                <Button variant="secondary" onClick={() => void discover()} disabled={discovering} icon={discovering ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}>Discover</Button>
              </div>
              <Input label="Access token (PAT)" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
              {discovered.length > 0 && (
                <div className="rounded-xl border border-[var(--border)]">
                  <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
                    <span>{selected.size}/{discovered.length} selected</span>
                    <button type="button" className="font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]" onClick={() => setSelected(new Set(selected.size === discovered.length ? [] : discovered.map((r) => r.repoPath)))}>
                      {selected.size === discovered.length ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div className="max-h-48 overflow-auto p-1.5">
                    {discovered.map((r) => (
                      <label key={r.repoPath} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--hover)]">
                        <input type="checkbox" checked={selected.has(r.repoPath)} onChange={() => toggleRepo(r.repoPath)} />
                        <span className="font-mono text-xs text-[var(--text-primary)]">{r.repoPath}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <BuildPackSelect value={buildPack} onChange={setBuildPack} />
            </div>
          )}

          {step === 2 && kind === 'DATABASE' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DATABASES.map((db) => (
                  <button key={db.type} type="button"
                    onClick={() => { setDatabaseType(db.type); setDatabaseVersion(db.defaultVersion); }}
                    className={`rounded-xl border p-3 text-center text-sm font-semibold transition ${databaseType === db.type ? 'border-[var(--text-primary)] bg-[var(--hover)] text-[var(--text-primary)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]'}`}>
                    {db.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Service name" placeholder="my-database" value={name} onChange={(e) => setName(e.target.value)} />
                <Input label="Version" value={databaseVersion} onChange={(e) => setDatabaseVersion(e.target.value)} />
              </div>
            </div>
          )}

          {step === 2 && kind === 'DOCKER' && (
            <div className="space-y-4">
              <Input label="Service name" placeholder="my-app" value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Image" placeholder="docker.io/library/nginx:latest" value={image} onChange={(e) => setImage(e.target.value)} />
              <Input label="Port" value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
          )}

          {/* Step 3 — review */}
          {step === 3 && (
            <dl className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-4 text-sm">
              <Row k="Type" v={kindLabel} />
              {kind === 'REPO' && (<><Row k="Provider" v={selectedProvider?.name ?? '—'} /><Row k="Repository" v={repoPath} /><Row k="Branch" v={branch} /><Row k="Build pack" v={buildPack} /><Row k="Name" v={name || repoToName(repoPath)} /></>)}
              {kind === 'GROUP' && (<><Row k="Provider" v={selectedProvider?.name ?? '—'} /><Row k="Group" v={groupPath} /><Row k="Services to create" v={`${selected.size}`} /><Row k="Build pack" v={buildPack} /></>)}
              {kind === 'DATABASE' && (<><Row k="Engine" v={DATABASES.find((d) => d.type === databaseType)?.label ?? databaseType} /><Row k="Version" v={databaseVersion} /><Row k="Name" v={name} /></>)}
              {kind === 'DOCKER' && (<><Row k="Image" v={image} /><Row k="Port" v={port} /><Row k="Name" v={name} /></>)}
            </dl>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
          <Button variant="secondary" onClick={() => (step === 1 ? onClose() : setStep((step - 1) as Step))} icon={step === 1 ? <X size={14} /> : <ArrowLeft size={14} />}>
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          {step === 2 && (
            <Button onClick={() => setStep(3)} disabled={!canReview}>Review →</Button>
          )}
          {step === 3 && (
            <Button onClick={() => void submit()} disabled={submitting} icon={submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}>
              {kind === 'GROUP' ? `Create ${selected.size} service${selected.size > 1 ? 's' : ''}` : 'Create service'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Small bits ────────────────────────────────────────────────────────── */

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[var(--text-muted)]">{k}</dt>
      <dd className="truncate font-medium text-[var(--text-primary)]">{v}</dd>
    </div>
  );
}

function ProviderSelect({ providers, value, onChange }: { providers: SourceProviderOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Provider</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none">
        {providers.length === 0 ? <option value="">No provider configured — add one in Git Providers</option> : null}
        {providers.map((p) => (
          <option key={p.id} value={p.id}>{p.name} · {p.type}{p.isDefault ? ' (default)' : ''}</option>
        ))}
      </select>
    </div>
  );
}

function BuildPackSelect({ value, onChange }: { value: BuildPack; onChange: (v: BuildPack) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Build pack</label>
      <select value={value} onChange={(e) => onChange(e.target.value as BuildPack)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none">
        {BUILD_PACKS.map((bp) => <option key={bp} value={bp}>{bp}</option>)}
      </select>
    </div>
  );
}
