'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  Container,
  Database,
  FolderGit2,
  GitBranch,
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

/* ─── Source kinds ──────────────────────────────────────────────────────── */

type SourceKind = 'REPO' | 'GROUP' | 'DATABASE' | 'DOCKER';

const SOURCE_KINDS: {
  kind: SourceKind;
  label: string;
  hint: string;
  icon: React.ReactNode;
}[] = [
  { kind: 'REPO', label: 'Git repository', hint: 'Deploy a single repo (GitLab / GitHub)', icon: <FolderGit2 size={18} /> },
  { kind: 'GROUP', label: 'Group / Org import', hint: 'Bulk-create services from every repo in a group', icon: <Boxes size={18} /> },
  { kind: 'DATABASE', label: 'Database', hint: 'Postgres, MySQL, Redis, MongoDB, RabbitMQ', icon: <Database size={18} /> },
  { kind: 'DOCKER', label: 'Docker image', hint: 'Deploy a prebuilt image from a registry', icon: <Container size={18} /> },
];

const DATABASES: { type: ManagedServiceType; label: string; defaultVersion: string }[] = [
  { type: 'POSTGRES', label: 'PostgreSQL', defaultVersion: '16' },
  { type: 'MYSQL', label: 'MySQL', defaultVersion: '8' },
  { type: 'REDIS', label: 'Redis', defaultVersion: '7' },
  { type: 'MONGODB', label: 'MongoDB', defaultVersion: '7' },
  { type: 'RABBITMQ', label: 'RabbitMQ', defaultVersion: '3' },
];

const BUILD_PACKS: BuildPack[] = ['NIXPACKS', 'DOCKERFILE', 'STATIC', 'BUILDPACK'];

/** Last path segment → service name (`group/sub/api` → `api`). */
function repoToName(repoPath: string): string {
  const seg = repoPath.trim().replace(/\/+$/, '').split('/').pop() ?? '';
  return seg || repoPath.trim();
}

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function CreateServiceWizard({ projectId, open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<'source' | 'configure'>('source');
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Providers (for REPO / GROUP)
  const [providers, setProviders] = useState<SourceProviderOption[]>([]);
  const [providerId, setProviderId] = useState('');

  // Shared form
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [branch, setBranch] = useState('main');
  const [buildPack, setBuildPack] = useState<BuildPack>('NIXPACKS');
  const [port, setPort] = useState('3000');

  // GROUP
  const [groupPath, setGroupPath] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredRepo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // DATABASE
  const [databaseType, setDatabaseType] = useState<ManagedServiceType>('POSTGRES');
  const [databaseVersion, setDatabaseVersion] = useState('16');

  // DOCKER
  const [image, setImage] = useState('');

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === providerId) ?? null,
    [providers, providerId],
  );

  const reset = useCallback(() => {
    setStep('source');
    setKind(null);
    setError(null);
    setSubmitting(false);
    setName('');
    setToken('');
    setRepoPath('');
    setBranch('main');
    setBuildPack('NIXPACKS');
    setPort('3000');
    setGroupPath('');
    setDiscovered([]);
    setSelected(new Set());
    setDatabaseType('POSTGRES');
    setDatabaseVersion('16');
    setImage('');
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

  const handlePickKind = (k: SourceKind) => {
    setKind(k);
    setError(null);
    setStep('configure');
  };

  const handleDiscover = async () => {
    if (!selectedProvider || !groupPath.trim() || !token.trim()) {
      setError('Provider, group/org path and token are required.');
      return;
    }
    setDiscovering(true);
    setError(null);
    try {
      const repos = await servicesService.discoverGroup(projectId, {
        provider: selectedProvider.type as 'GITLAB' | 'GITHUB',
        groupPath: groupPath.trim(),
        token: token.trim(),
        providerId: selectedProvider.id,
      });
      setDiscovered(repos);
      setSelected(new Set(repos.map((r) => r.repoPath)));
      if (repos.length === 0) setError('No repositories found for this group/org.');
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setDiscovering(false);
    }
  };

  const toggleRepo = (repoPathValue: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(repoPathValue)) next.delete(repoPathValue);
      else next.add(repoPathValue);
      return next;
    });
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (kind === 'REPO') {
        if (!selectedProvider || !repoPath.trim() || !token.trim()) {
          throw new Error('Provider, repo path and token are required.');
        }
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
      } else if (kind === 'GROUP') {
        if (!selectedProvider || selected.size === 0 || !token.trim()) {
          throw new Error('Select at least one repository.');
        }
        const provider = selectedProvider.type as 'GITLAB' | 'GITHUB';
        const repos = discovered.filter((r) => selected.has(r.repoPath));
        // Create sequentially so a partial failure leaves a clear state.
        for (const repo of repos) {
          await servicesService.create(projectId, {
            name: repoToName(repo.repoPath),
            type: 'APPLICATION',
            sourceType: 'GIT',
            repoPath: repo.repoPath,
            branch: repo.defaultBranch || 'main',
            providerId: selectedProvider.id,
            buildPack,
            source: {
              provider,
              repoPath: repo.repoPath,
              token: token.trim(),
              branch: repo.defaultBranch || 'main',
            },
          });
        }
      } else if (kind === 'DATABASE') {
        if (!name.trim()) throw new Error('Service name is required.');
        await servicesService.create(projectId, {
          name: name.trim(),
          type: 'DATABASE',
          databaseType,
          databaseVersion: databaseVersion.trim() || 'latest',
        });
      } else if (kind === 'DOCKER') {
        if (!name.trim() || !image.trim()) throw new Error('Name and image are required.');
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

  const providerIcon = (_type: string) => <GitBranch size={13} />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Boxes size={16} className="text-[var(--text-primary)]" />
            <h2 className="text-sm font-bold text-[var(--text-primary)]">New service</h2>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Step 1 — pick source kind */}
          {step === 'source' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SOURCE_KINDS.map((s) => (
                <button
                  key={s.kind}
                  onClick={() => handlePickKind(s.kind)}
                  className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-4 text-left transition-all hover:border-[var(--text-primary)]/40 hover:bg-[var(--hover)]"
                >
                  <span className="mt-0.5 text-[var(--text-primary)]">{s.icon}</span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">{s.label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">{s.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2 — configure */}
          {step === 'configure' && kind === 'REPO' && (
            <div className="space-y-3">
              <ProviderSelect providers={providers} value={providerId} onChange={setProviderId} icon={providerIcon} />
              <Input label="Repository path" placeholder="group/project or owner/repo" value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)} leftIcon={<FolderGit2 size={13} />} />
              <Input label="Access token (PAT)" type="password" placeholder="glpat-… / ghp_…" value={token}
                onChange={(e) => setToken(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} leftIcon={<GitBranch size={13} />} />
                <Input label="Port" value={port} onChange={(e) => setPort(e.target.value)} />
              </div>
              <BuildPackSelect value={buildPack} onChange={setBuildPack} />
              <Input label="Service name (optional)" placeholder={repoPath ? repoToName(repoPath) : 'api'} value={name}
                onChange={(e) => setName(e.target.value)} />
            </div>
          )}

          {step === 'configure' && kind === 'GROUP' && (
            <div className="space-y-3">
              <ProviderSelect providers={providers} value={providerId} onChange={setProviderId} icon={providerIcon} />
              <Input label="Group / Org path" placeholder="my-group or my-org" value={groupPath}
                onChange={(e) => setGroupPath(e.target.value)} leftIcon={<Boxes size={13} />} />
              <Input label="Access token (PAT)" type="password" placeholder="glpat-… / ghp_…" value={token}
                onChange={(e) => setToken(e.target.value)} />
              <Button variant="secondary" size="sm" onClick={handleDiscover} loading={discovering}
                icon={<Search size={13} />}>
                Discover repositories
              </Button>
              {discovered.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>{selected.size} / {discovered.length} selected</span>
                    <button className="hover:text-[var(--text-primary)]"
                      onClick={() => setSelected(new Set(selected.size === discovered.length ? [] : discovered.map((r) => r.repoPath)))}>
                      {selected.size === discovered.length ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-1.5">
                    {discovered.map((r) => (
                      <label key={r.repoPath} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--hover)]">
                        <input type="checkbox" checked={selected.has(r.repoPath)} onChange={() => toggleRepo(r.repoPath)} />
                        <span className="font-mono text-xs text-[var(--text-primary)]">{r.repoPath}</span>
                        <span className="ml-auto text-[10px] text-[var(--text-muted)]">{r.defaultBranch}</span>
                      </label>
                    ))}
                  </div>
                  <BuildPackSelect value={buildPack} onChange={setBuildPack} />
                </div>
              )}
            </div>
          )}

          {step === 'configure' && kind === 'DATABASE' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DATABASES.map((db) => (
                  <button key={db.type}
                    onClick={() => { setDatabaseType(db.type); setDatabaseVersion(db.defaultVersion); }}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-all ${
                      databaseType === db.type
                        ? 'border-[var(--text-primary)] bg-[var(--hover)] text-[var(--text-primary)]'
                        : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover)]'
                    }`}>
                    <Database size={14} /> {db.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Version" value={databaseVersion} onChange={(e) => setDatabaseVersion(e.target.value)} />
                <Input label="Service name" placeholder="db" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
          )}

          {step === 'configure' && kind === 'DOCKER' && (
            <div className="space-y-3">
              <Input label="Image reference" placeholder="nginx:latest or ghcr.io/owner/img:tag" value={image}
                onChange={(e) => setImage(e.target.value)} leftIcon={<Container size={13} />} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Service name" placeholder="proxy" value={name} onChange={(e) => setName(e.target.value)} />
                <Input label="Port" value={port} onChange={(e) => setPort(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
          {step === 'configure' ? (
            <Button variant="ghost" size="sm" onClick={() => { setStep('source'); setError(null); }}>
              Back
            </Button>
          ) : <span />}
          {step === 'configure' && (
            <Button size="sm" onClick={submit} loading={submitting}>
              {kind === 'GROUP' ? `Create ${selected.size || ''} service${selected.size === 1 ? '' : 's'}` : 'Create service'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function ProviderSelect({
  providers,
  value,
  onChange,
  icon,
}: {
  providers: SourceProviderOption[];
  value: string;
  onChange: (id: string) => void;
  icon: (type: string) => React.ReactNode;
}) {
  if (providers.length === 0) {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs text-amber-400">
        No source provider configured. Add one in Settings → Git first.
      </div>
    );
  }
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Provider
      </label>
      <div className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <button key={p.id} onClick={() => onChange(p.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-all ${
              value === p.id
                ? 'border-[var(--text-primary)] bg-[var(--hover)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover)]'
            }`}>
            {icon(p.type)} {p.name}
            {p.status !== 'CONFIGURED' && <span className="text-[9px] text-amber-400">⚠</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function BuildPackSelect({ value, onChange }: { value: BuildPack; onChange: (b: BuildPack) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Build pack
      </label>
      <div className="flex flex-wrap gap-2">
        {BUILD_PACKS.map((b) => (
          <button key={b} onClick={() => onChange(b)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${
              value === b
                ? 'border-[var(--text-primary)] bg-[var(--hover)] text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover)]'
            }`}>
            {b}
          </button>
        ))}
      </div>
    </div>
  );
}
