'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { servicesService } from '@/services/services.service';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import { SectionCard } from '@/components/layout/section-card';
import type { BuildPack, Service, UpdateServicePayload } from '@/types/service';
import type { SourceProviderOption } from '@/types/project';

const BUILD_PACKS: { value: BuildPack; label: string }[] = [
  { value: 'DOCKERFILE', label: 'Dockerfile' },
  { value: 'NIXPACKS', label: 'Nixpacks' },
  { value: 'DOCKER_COMPOSE', label: 'Docker Compose' },
  { value: 'BUILDPACK', label: 'Buildpack' },
  { value: 'STATIC', label: 'Static site' },
  { value: 'NONE', label: 'None' },
];

const inputClass =
  'w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]';
const labelClass =
  'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]';

/**
 * Per-service editable Source/Build configuration (PLAN_AMELIORATION.md §5.1
 * "build contextuel"). Backed by the existing PUT /projects/:id/services/:id
 * endpoint — the Service model already carries all these fields, so no backend
 * change is required.
 */
export function ServiceConfigForm({
  projectId,
  service,
  onSaved,
}: {
  projectId: string;
  service: Service;
  onSaved: () => void;
}) {
  const [branch, setBranch] = useState(service.branch ?? '');
  const [rootDir, setRootDir] = useState(service.rootDir ?? '/');
  const [buildPack, setBuildPack] = useState<BuildPack>(service.buildPack ?? 'DOCKERFILE');
  const [buildMode, setBuildMode] = useState<string>(service.buildMode ?? 'LOCAL');
  const [port, setPort] = useState(service.port != null ? String(service.port) : '');
  const [startCommand, setStartCommand] = useState(service.startCommand ?? '');
  const [healthcheckPath, setHealthcheckPath] = useState(service.healthcheckPath ?? '');
  const [replicas, setReplicas] = useState(service.replicas != null ? String(service.replicas) : '1');
  const [dockerfile, setDockerfile] = useState(service.dockerfile ?? '');
  const [providerId, setProviderId] = useState(service.providerId ?? '');
  const [repoPath, setRepoPath] = useState(service.repoPath ?? service.repoUrl ?? '');
  const [providers, setProviders] = useState<SourceProviderOption[]>([]);

  useEffect(() => {
    projectsService.getSourceProviders()
      .then((list) => {
        setProviders(list);
        setProviderId((prev) => prev || list.find((p) => p.isDefault)?.id || list[0]?.id || '');
      })
      .catch(() => setProviders([]));
  }, []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload: UpdateServicePayload = {
        branch: branch.trim() || undefined,
        rootDir: rootDir.trim() || undefined,
        buildPack,
        buildMode,
        port: port ? Number(port) : undefined,
        startCommand: startCommand.trim() || undefined,
        healthcheckPath: healthcheckPath.trim() || undefined,
        replicas: replicas ? Number(replicas) : undefined,
        ...(buildPack === 'DOCKERFILE' && dockerfile.trim() ? { dockerfile } : {}),
        ...(providerId ? { providerId } : {}),
        ...(repoPath.trim() ? { repoPath: repoPath.trim() } : {}),
      };
      await servicesService.update(projectId, service.id, payload);
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
      <SectionCard title="Source" description="Where this service's code comes from — choose a provider and repository.">
        {providers.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProviderId(p.id)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  providerId === p.id
                    ? 'border-[var(--text-primary)] bg-[var(--hover)] text-[var(--text-primary)]'
                    : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover)]'
                }`}
              >
                {p.name} · {p.type}
              </button>
            ))}
          </div>
        )}
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="svc-repopath">Repository path</label>
            <input id="svc-repopath" className={`${inputClass} font-mono`} value={repoPath} placeholder="group/project or owner/repo"
              onChange={(e) => setRepoPath(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="svc-branch">Branch</label>
            <input id="svc-branch" className={inputClass} value={branch} placeholder="main"
              onChange={(e) => setBranch(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="svc-rootdir">Root directory</label>
            <input id="svc-rootdir" className={`${inputClass} font-mono`} value={rootDir} placeholder="/"
              onChange={(e) => setRootDir(e.target.value)} />
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Build" description="How this service is built and run.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="svc-buildpack">Build pack</label>
            <select id="svc-buildpack" className={inputClass} value={buildPack}
              onChange={(e) => setBuildPack(e.target.value as BuildPack)}>
              {BUILD_PACKS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="svc-buildmode">Build mode</label>
            <select id="svc-buildmode" className={inputClass} value={buildMode}
              onChange={(e) => setBuildMode(e.target.value)}>
              <option value="LOCAL">Build on server (sur le VPS)</option>
              <option value="REGISTRY">Registry (image construite par la CI → pull)</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="svc-port">Port</label>
            <input id="svc-port" type="number" min={1} className={`${inputClass} font-mono`} value={port} placeholder="3000"
              onChange={(e) => setPort(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="svc-start">Start command</label>
            <input id="svc-start" className={`${inputClass} font-mono`} value={startCommand} placeholder="npm run start:prod"
              onChange={(e) => setStartCommand(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="svc-health">Healthcheck path</label>
            <input id="svc-health" className={`${inputClass} font-mono`} value={healthcheckPath} placeholder="/health"
              onChange={(e) => setHealthcheckPath(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="svc-replicas">Replicas</label>
            <input id="svc-replicas" type="number" min={0} className={`${inputClass} font-mono`} value={replicas}
              onChange={(e) => setReplicas(e.target.value)} />
          </div>
          {buildPack === 'DOCKERFILE' && (
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="svc-dockerfile">Dockerfile (optional override)</label>
              <textarea id="svc-dockerfile" rows={6} className={`${inputClass} font-mono`} value={dockerfile}
                placeholder={'FROM node:20\nWORKDIR /app\n...'}
                onChange={(e) => setDockerfile(e.target.value)} />
            </div>
          )}
        </div>
      </SectionCard>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void handleSave()} disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save configuration
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
