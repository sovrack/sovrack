'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { servicesService } from '@/features/projects/api/services.service';
import { projectsService } from '@/features/projects/api/projects.service';
import { getApiErrorMessage } from '@/shared/lib/api';
import { splitImageRef } from '@/features/deployments/utils';
import { SectionCard } from '@/shared/layout/section-card';
import type { BuildPack, Service, UpdateServicePayload } from '@/features/projects/types/service';
import type { SourceProviderOption } from '@/features/projects/types/project';

// Build packs proposés à l'utilisateur. BUILDPACK (Cloud Native Buildpacks)
// est volontairement omis : non implémenté côté moteur (pas de `pack build`) ;
// Nixpacks couvre le même besoin « build sans Dockerfile » et fonctionne.
// DOCKER_COMPOSE est également omis : le moteur de déploiement ne déploie qu'un
// seul conteneur (pas d'expansion d'un stack compose en N services) — l'offrir
// créerait un service qui ne se déploie jamais. À réactiver quand l'exécuteur
// compose multi-conteneurs sera implémenté.
const BUILD_PACKS: { value: BuildPack; label: string }[] = [
  { value: 'DOCKERFILE', label: 'Dockerfile' },
  { value: 'NIXPACKS', label: 'Nixpacks' },
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
  const [deployTrigger, setDeployTrigger] = useState<string>(service.deployTrigger ?? 'PUSH');
  const [port, setPort] = useState(service.port != null ? String(service.port) : '');
  const [startCommand, setStartCommand] = useState(service.startCommand ?? '');
  const [healthcheckPath, setHealthcheckPath] = useState(service.healthcheckPath ?? '');
  const [dockerfile, setDockerfile] = useState(service.dockerfile ?? '');
  const [providerId, setProviderId] = useState(service.providerId ?? '');
  // Dépôt figé (lecture seule) — pas de setter.
  const repoPath = service.repoPath ?? service.repoUrl ?? '';
  // Image externe (sourceType DOCKER_IMAGE) : la référence d'image:tag EST stockée
  // dans repoPath → on l'édite via 2 champs Image + Tag (cf. C3 / Docker Registry).
  const isExternalImage = service.sourceType === 'DOCKER_IMAGE';
  const isRegistryMode = buildMode.toUpperCase() === 'REGISTRY';
  const initialRef = splitImageRef(repoPath);
  const [image, setImage] = useState(initialRef.image);
  const [tag, setTag] = useState(initialRef.tag);
  // Mode REGISTRY : image:tag à tirer (persistée dans Service.registryImage).
  const initialRegistryRef = splitImageRef(service.registryImage ?? '');
  const [registryImageName, setRegistryImageName] = useState(initialRegistryRef.image);
  const [registryTag, setRegistryTag] = useState(initialRegistryRef.tag);
  const [providers, setProviders] = useState<SourceProviderOption[]>([]);
  const [branches, setBranches] = useState<string[]>([]);

  useEffect(() => {
    projectsService.getSourceProviders()
      .then((list) => {
        setProviders(list);
        setProviderId((prev) => prev || list.find((p) => p.isDefault)?.id || list[0]?.id || '');
      })
      .catch(() => setProviders([]));
  }, []);

  // Branches disponibles du dépôt → autocomplétion du champ Branch (S2).
  useEffect(() => {
    projectsService.getBranches(projectId)
      .then((list) => setBranches(list.map((b) => b.name)))
      .catch(() => setBranches([]));
  }, [projectId]);

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
        buildMode: buildMode as UpdateServicePayload['buildMode'],
        deployTrigger: deployTrigger as UpdateServicePayload['deployTrigger'],
        port: port ? Number(port) : undefined,
        startCommand: startCommand.trim() || undefined,
        healthcheckPath: healthcheckPath.trim() || undefined,
        ...(buildPack === 'DOCKERFILE' && dockerfile.trim() ? { dockerfile } : {}),
        ...(providerId ? { providerId } : {}),
        // Image externe : repoPath = image[:tag] saisi ; sinon dépôt git figé.
        ...(isExternalImage
          ? (image.trim() ? { repoPath: `${image.trim()}${tag.trim() ? `:${tag.trim()}` : ''}` } : {})
          : (repoPath.trim() ? { repoPath: repoPath.trim() } : {})),
        // Mode REGISTRY : image:tag à tirer (vide = dérivation auto par la CI).
        ...(isRegistryMode && !isExternalImage
          ? { registryImage: registryImageName.trim() ? `${registryImageName.trim()}${registryTag.trim() ? `:${registryTag.trim()}` : ''}` : '' }
          : {}),
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
          {isExternalImage ? (
            <>
              <div>
                <label className={labelClass} htmlFor="svc-image">Image Docker</label>
                <input id="svc-image" className={`${inputClass} font-mono`} value={image}
                  placeholder="nginx ou registry.gitlab.com/grp/app"
                  onChange={(e) => setImage(e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="svc-tag">Tag</label>
                <input id="svc-tag" className={`${inputClass} font-mono`} value={tag} placeholder="latest"
                  onChange={(e) => setTag(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="svc-repopath">Repository path</label>
              {/* Source figée : le dépôt s'établit à la création (changer de dépôt = autre service). */}
              <input id="svc-repopath" className={`${inputClass} font-mono opacity-70`} value={repoPath}
                readOnly title="The repository is fixed. To change it, create a new service." />
            </div>
          )}
          <div>
            <label className={labelClass} htmlFor="svc-branch">Branch</label>
            {/* Combobox : autocomplétion depuis les branches dispo + saisie libre (S2). */}
            <input id="svc-branch" className={inputClass} value={branch} placeholder="main" list="svc-branches"
              onChange={(e) => setBranch(e.target.value)} />
            <datalist id="svc-branches">
              {branches.map((b) => <option key={b} value={b} />)}
            </datalist>
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
              <option value="LOCAL">Build on server (on the VPS)</option>
              <option value="REGISTRY">Registry (image built by CI → pull)</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="svc-trigger">Deployment trigger</label>
            <select id="svc-trigger" className={inputClass} value={deployTrigger}
              onChange={(e) => setDeployTrigger(e.target.value)}>
              <option value="PUSH">Push — deploy on every git push</option>
              <option value="PIPELINE_SUCCESS">Pipeline success — deploy when CI goes green</option>
              <option value="MANUAL">Manual — deploy on demand only</option>
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
          {buildPack === 'DOCKERFILE' && (
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="svc-dockerfile">Dockerfile (optional override)</label>
              <textarea id="svc-dockerfile" rows={6} className={`${inputClass} font-mono`} value={dockerfile}
                placeholder={'FROM node:20\nWORKDIR /app\n...'}
                onChange={(e) => setDockerfile(e.target.value)} />
            </div>
          )}
          {isRegistryMode && !isExternalImage && (
            <>
              <div>
                <label className={labelClass} htmlFor="svc-regimage">Image registre</label>
                <input id="svc-regimage" className={`${inputClass} font-mono`} value={registryImageName}
                  placeholder="registry.gitlab.com/grp/app"
                  onChange={(e) => setRegistryImageName(e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="svc-regtag">Tag</label>
                <input id="svc-regtag" className={`${inputClass} font-mono`} value={registryTag} placeholder="latest"
                  onChange={(e) => setRegistryTag(e.target.value)} />
              </div>
              <div className="sm:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
                In <span className="font-semibold text-[var(--text-secondary)]">Registry</span> mode, the image is pulled from the registry at deploy time. Leave empty to <span className="font-semibold">derive it automatically</span> from CI; set it to pin a specific image. Registry credentials live in <span className="font-semibold">Settings → Registry</span>.
              </div>
            </>
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
