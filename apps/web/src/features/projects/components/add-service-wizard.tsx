'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  FolderGit2,
  Loader2,
  Package,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { getApiErrorMessage } from '@/shared/lib/api';
import { projectsService } from '@/features/projects/api/projects.service';
import { servicesService } from '@/features/projects/api/services.service';
import type { SourceProviderOption } from '@/features/projects/types/project';
import type {
  CreateServicePayload,
  DiscoveredRepo,
  ManagedServiceType,
  ServiceTemplate,
} from '@/features/projects/types/service';
import {
  KINDS,
  DATABASES,
  repoToName,
  normalizeRepoPath,
  type ServiceKind,
  type AppMode,
  type Step,
} from './add-service-wizard.catalog';

type Props = { projectId: string; open: boolean; onClose: () => void; onCreated: () => void };

/* ─── Wizard ────────────────────────────────────────────────────────────── */

export function AddServiceWizard({ projectId, open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [kind, setKind] = useState<ServiceKind | null>(null);
  const [appMode, setAppMode] = useState<AppMode>('repo');
  const [platform, setPlatform] = useState<'GITLAB' | 'GITHUB' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [providers, setProviders] = useState<SourceProviderOption[]>([]);
  const [providerId, setProviderId] = useState('');

  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [branch, setBranch] = useState('main');
  const [port, setPort] = useState('3000');

  const [groupPath, setGroupPath] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredRepo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [databaseType, setDatabaseType] = useState<ManagedServiceType>('POSTGRES');
  const [databaseVersion, setDatabaseVersion] = useState('16');
  const [image, setImage] = useState('');
  const [composeContent, setComposeContent] = useState('');

  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === providerId) ?? null,
    [providers, providerId],
  );

  const reset = useCallback(() => {
    setStep(1); setKind(null); setAppMode('repo'); setPlatform(null); setError(null); setSubmitting(false);
    setName(''); setToken(''); setRepoPath(''); setBranch('main');
    setPort('3000'); setGroupPath('');
    setDiscovered([]); setSelected(new Set());
    setDatabaseType('POSTGRES'); setDatabaseVersion('16'); setImage(''); setComposeContent('');
    setTemplates([]); setTemplateId('');
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

  // Close on Escape (parity with the shared <Modal>).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pickKind = (k: ServiceKind) => {
    setKind(k); setPlatform(null); setError(null); setStep(2);
    if (k === 'TEMPLATE') {
      servicesService
        .listTemplates(projectId)
        .then((list) => {
          setTemplates(list);
          if (list[0]) setTemplateId(list[0].id);
        })
        .catch((e) => setError(getApiErrorMessage(e)));
    }
  };

  const pickPlatform = (p: 'GITLAB' | 'GITHUB') => {
    setPlatform(p);
    const match = providers.filter((x) => x.type === p);
    setProviderId(match.find((x) => x.isDefault)?.id || match[0]?.id || '');
  };

  const discover = async () => {
    if (!selectedProvider || !groupPath.trim() || (!token.trim() && selectedProvider.status !== 'CONFIGURED')) {
      setError('Provider and group/org path required (plus a token if the provider is not connected).');
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
    if (kind === 'APPLICATION') {
      if (appMode === 'group') return selected.size > 0;
      return Boolean(selectedProvider && repoPath.trim() && (token.trim() || selectedProvider.status === 'CONFIGURED'));
    }
    if (kind === 'DATABASE') return name.trim().length > 0;
    if (kind === 'DOCKER') return Boolean(name.trim() && image.trim());
    if (kind === 'COMPOSE') return Boolean(name.trim() && composeContent.trim());
    if (kind === 'TEMPLATE') return Boolean(selectedTemplate && name.trim());
    return false;
  })();

  const submit = async () => {
    setError(null); setSubmitting(true);
    try {
      if (kind === 'APPLICATION' && selectedProvider && appMode === 'repo') {
        const provider = selectedProvider.type as 'GITLAB' | 'GITHUB';
        const normalizedPath = normalizeRepoPath(repoPath);
        const payload: CreateServicePayload = {
          name: name.trim() || repoToName(normalizedPath),
          type: 'APPLICATION',
          sourceType: 'GIT',
          repoPath: normalizedPath,
          branch: branch.trim() || 'main',
          providerId: selectedProvider.id,
          port: Number(port) || undefined,
          // Token only needed when the provider isn't already connected — otherwise
          // the platform reuses the stored provider credential.
          ...(token.trim()
            ? { source: { provider, repoPath: normalizedPath, token: token.trim(), branch: branch.trim() || 'main' } }
            : {}),
        };
        await servicesService.create(projectId, payload);
      } else if (kind === 'APPLICATION' && selectedProvider && appMode === 'group') {
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
            ...(token.trim()
              ? { source: { provider, repoPath: repo.repoPath, token: token.trim(), branch: repo.defaultBranch || 'main' } }
              : {}),
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
      } else if (kind === 'COMPOSE') {
        await servicesService.create(projectId, {
          name: name.trim(),
          type: 'APPLICATION',
          sourceType: 'NONE',
          buildPack: 'DOCKER_COMPOSE',
          dockerComposeContent: composeContent,
        });
      } else if (kind === 'TEMPLATE' && selectedTemplate) {
        await servicesService.createFromTemplate(projectId, selectedTemplate.id, name.trim());
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
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]">
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
            <div className="flex flex-col gap-2">
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

          {/* Step 2a — choose Git platform (photo 2) */}
          {step === 2 && kind === 'APPLICATION' && !platform && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">Choose the Git platform for this service.</p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { type: 'GITLAB' as const, label: 'GitLab', icon: <FolderGit2 size={22} className="text-orange-400" />, hint: 'DevSecOps platform' },
                  { type: 'GITHUB' as const, label: 'GitHub', icon: <FolderGit2 size={22} />, hint: 'Code hosting platform' },
                ]).map((pl) => {
                  const has = providers.some((p) => p.type === pl.type);
                  return (
                    <button
                      key={pl.type}
                      type="button"
                      onClick={() => pickPlatform(pl.type)}
                      className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-5 text-center transition hover:border-[var(--text-muted)] hover:bg-[var(--hover)]"
                    >
                      <span className="text-[var(--text-primary)]">{pl.icon}</span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{pl.label}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{has ? pl.hint : 'Not configured — add it in Git Providers'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2b — configure (photo 1) */}
          {step === 2 && kind === 'APPLICATION' && platform && (
            <div className="space-y-4">
              <button type="button" onClick={() => setPlatform(null)} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">← Change platform ({platform})</button>
              {providers.filter((p) => p.type === platform).length === 0 ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                  No {platform} provider configured yet. <a href="/settings/git" className="font-semibold underline">Add one in Git Providers</a>, then reopen this wizard.
                </div>
              ) : (
                <>
                  <ProviderSelect providers={providers.filter((p) => p.type === platform)} value={providerId} onChange={setProviderId} />

                  <div className="flex gap-1.5">
                    {(['repo', 'group'] as AppMode[]).map((m) => (
                      <button key={m} type="button" onClick={() => setAppMode(m)}
                        className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${appMode === m ? 'border-[var(--text-primary)] bg-[var(--hover)] text-[var(--text-primary)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover)]'}`}>
                        {m === 'repo' ? 'Single repository' : 'Import a whole group'}
                      </button>
                    ))}
                  </div>

                  {appMode === 'repo' ? (
                <>
                  <Input
                    label="Repository path"
                    placeholder="group/project or owner/repo (or paste full URL)"
                    value={repoPath}
                    onChange={(e) => setRepoPath(normalizeRepoPath(e.target.value))}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
                    <Input label="Port" value={port} onChange={(e) => setPort(e.target.value)} />
                  </div>
                  <Input label="Service name (optional)" placeholder={repoPath ? repoToName(repoPath) : 'api'} value={name} onChange={(e) => setName(e.target.value)} />
                </>
              ) : (
                <>
                  <div className="flex items-end gap-2">
                    <div className="flex-1"><Input label="Group / org path" placeholder="company/my-apps" value={groupPath} onChange={(e) => setGroupPath(e.target.value)} /></div>
                    <Button variant="secondary" onClick={() => void discover()} disabled={discovering} icon={discovering ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}>Discover</Button>
                  </div>
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
                </>
              )}

                  <Input
                    label={selectedProvider?.status === 'CONFIGURED' ? 'Access token (PAT) — optional, provider already connected' : 'Access token (PAT)'}
                    type="password"
                    placeholder={selectedProvider?.status === 'CONFIGURED' ? 'Leave empty to use the connected provider' : 'Required to read the repo'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </>
              )}
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

          {step === 2 && kind === 'COMPOSE' && (
            <div className="space-y-4">
              <Input label="Service name" placeholder="my-stack" value={name} onChange={(e) => setName(e.target.value)} />
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">docker-compose.yml</label>
                <textarea
                  rows={10}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none"
                  placeholder={'services:\n  app:\n    image: nginx:alpine\n    ports:\n      - "80:80"'}
                  value={composeContent}
                  onChange={(e) => setComposeContent(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 2 && kind === 'TEMPLATE' && (
            <div className="space-y-4">
              {templates.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No template available.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    {templates.map((t) => {
                      const active = t.id === templateId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTemplateId(t.id)}
                          className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${active ? 'border-[var(--text-primary)] bg-[var(--hover)]' : 'border-[var(--border)] bg-[var(--bg-app)] hover:bg-[var(--hover)]'}`}
                        >
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)]"><Package size={18} /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-[var(--text-primary)]">{t.name}</span>
                            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{t.description}</span>
                            <span className="mt-1.5 flex flex-wrap gap-1">
                              {t.services.map((s) => (
                                <span key={s.nameSuffix} className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                                  {s.databaseType ?? s.nameSuffix}
                                </span>
                              ))}
                            </span>
                          </span>
                          {active && <Check size={16} className="mt-1 shrink-0 text-green-400" />}
                        </button>
                      );
                    })}
                  </div>
                  <Input label="Base name" placeholder="my-stack" value={name} onChange={(e) => setName(e.target.value)} />
                  {selectedTemplate && name.trim() && (
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Will create: {selectedTemplate.services.map((s) => `${name.trim()}-${s.nameSuffix}`).join(', ')}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 3 — review */}
          {step === 3 && (
            <dl className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-4 text-sm">
              <Row k="Type" v={kindLabel} />
              {kind === 'APPLICATION' && appMode === 'repo' && (<><Row k="Provider" v={selectedProvider?.name ?? '—'} /><Row k="Repository" v={repoPath} /><Row k="Branch" v={branch} /><Row k="Name" v={name || repoToName(repoPath)} /></>)}
              {kind === 'APPLICATION' && appMode === 'group' && (<><Row k="Provider" v={selectedProvider?.name ?? '—'} /><Row k="Group" v={groupPath} /><Row k="Services to create" v={`${selected.size}`} /></>)}
              {kind === 'DATABASE' && (<><Row k="Engine" v={DATABASES.find((d) => d.type === databaseType)?.label ?? databaseType} /><Row k="Version" v={databaseVersion} /><Row k="Name" v={name} /></>)}
              {kind === 'DOCKER' && (<><Row k="Image" v={image} /><Row k="Port" v={port} /><Row k="Name" v={name} /></>)}
              {kind === 'COMPOSE' && (<><Row k="Name" v={name} /><Row k="Compose lines" v={`${composeContent.split('\n').length}`} /></>)}
              {kind === 'TEMPLATE' && selectedTemplate && (<><Row k="Template" v={selectedTemplate.name} /><Row k="Base name" v={name} /><Row k="Services to create" v={selectedTemplate.services.map((s) => `${name.trim()}-${s.nameSuffix}`).join(', ')} /></>)}
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
              {kind === 'APPLICATION' && appMode === 'group'
                ? `Create ${selected.size} service${selected.size > 1 ? 's' : ''}`
                : kind === 'TEMPLATE' && selectedTemplate
                  ? `Create ${selectedTemplate.services.length} services`
                  : 'Create service'}
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

