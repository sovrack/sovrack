'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api';
import { buildService } from '@/services/build.service';

type BuildMode = 'NIXPACKS' | 'DOCKERFILE' | 'COMPOSE' | 'EXISTING_IMAGE';

type ProjectBuildSetupDialogProps = {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onDone: () => Promise<void> | void;
};

const BUILD_MODE_OPTIONS: Array<{
  value: BuildMode;
  title: string;
  description: string;
}> = [
  {
    value: 'NIXPACKS',
    title: 'Nixpacks (recommended)',
    description: 'Auto build from detected runtime.',
  },
  {
    value: 'DOCKERFILE',
    title: 'Existing Dockerfile',
    description: 'Use repository Dockerfile strategy.',
  },
  {
    value: 'COMPOSE',
    title: 'Docker Compose',
    description: 'Deploy services defined by compose.',
  },
  {
    value: 'EXISTING_IMAGE',
    title: 'Existing image',
    description: 'Use a pre-built image pipeline.',
  },
];

function mapDetectedTypeLabel(type: string): string {
  if (type === 'nestjs') return 'NestJS detected';
  if (type === 'nextjs') return 'Next.js detected';
  if (type === 'react') return 'React detected';
  if (type === 'go') return 'Go detected';
  if (type === 'django') return 'Django detected';
  if (type === 'laravel') return 'Laravel detected';
  if (type === 'spring-boot') return 'Spring Boot detected';
  if (type === 'dockerized') return 'Dockerized app detected';
  if (type === 'static-frontend') return 'Static frontend detected';
  if (type === 'postgres-service') return 'PostgreSQL service detected';
  if (type === 'redis-service') return 'Redis service detected';
  if (type === 'nodejs') return 'Node.js 20 detected';
  if (type === 'python') return 'Python detected';
  if (type === 'php') return 'PHP detected';
  if (type === 'ruby') return 'Ruby detected';
  if (type === 'docker') return 'Dockerfile detected';
  if (type === 'compose') return 'Docker Compose detected';
  return 'Runtime detected';
}

function mapBuildModeToProjectType(mode: BuildMode, detectedType: string): string {
  if (mode === 'DOCKERFILE') return 'docker';
  if (mode === 'COMPOSE') return 'compose';
  if (mode === 'EXISTING_IMAGE') return 'docker';
  if (detectedType) return detectedType;
  return 'nodejs';
}

export function ProjectBuildSetupDialog({
  open,
  projectId,
  onClose,
  onDone,
}: ProjectBuildSetupDialogProps) {
  const [detectLoading, setDetectLoading] = useState(false);
  const [detectedType, setDetectedType] = useState('nodejs');
  const [buildMode, setBuildMode] = useState<BuildMode>('NIXPACKS');
  const [buildPort, setBuildPort] = useState('3000');
  const [startCmd, setStartCmd] = useState('npm start');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setError(null);
    setDone(false);
    setBuildMode('NIXPACKS');
    setBuildPort('3000');
    setStartCmd('npm start');
    setDetectedType('nodejs');

    setDetectLoading(true);
    buildService
      .detect(projectId)
      .then((result) => {
        setDetectedType(result.recommendedBuildType || result.type || 'nodejs');
        setBuildPort(String(result.recommendedPort || 3000));
        setStartCmd(result.recommendedStartCommand || 'npm start');
      })
      .catch(() => {
        setDetectedType('nodejs');
        setBuildPort('3000');
        setStartCmd('npm start');
      })
      .finally(() => {
        setDetectLoading(false);
      });
  }, [open, projectId]);

  const detectedLabel = useMemo(
    () => mapDetectedTypeLabel(detectedType),
    [detectedType],
  );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const portNumber = Number.parseInt(buildPort, 10);
      await buildService.updateConfig(projectId, {
        projectType: mapBuildModeToProjectType(buildMode, detectedType),
        buildPort: Number.isFinite(portNumber) && portNumber > 0 ? portNumber : 3000,
        buildStartCmd: startCmd.trim() || 'npm start',
      });
      setDone(true);
    } catch (saveError) {
      setError(getApiErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />

      <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
              Step 3 / 3
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
              Configure Build
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Confirm runtime defaults and choose build strategy.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error && <Alert tone="error">{error}</Alert>}

          {!done ? (
            <>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {detectLoading ? 'Detecting runtime…' : `✅ ${detectedLabel}`}
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Port: {buildPort} · Start command: {startCmd}
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                  Build mode
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {BUILD_MODE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`rounded-xl border px-3 py-2 transition ${
                        buildMode === option.value
                          ? 'border-[var(--border)] bg-[var(--hover)]'
                          : 'border-[var(--border)] bg-[var(--bg-card)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="buildMode"
                        checked={buildMode === option.value}
                        onChange={() => setBuildMode(option.value)}
                        className="mr-2"
                      />
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {option.title}
                      </span>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {option.description}
                      </p>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                    Port
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={buildPort}
                    onChange={(event) => setBuildPort(event.target.value)}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                    Start command
                  </label>
                  <input
                    type="text"
                    value={startCmd}
                    onChange={(event) => setStartCmd(event.target.value)}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
                <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
                  Close
                </Button>
                <Button type="button" onClick={() => void handleSave()} loading={saving}>
                  Save build config
                </Button>
              </div>
            </>
          ) : (
            <>
              <Alert tone="success" title="Build step completed">
                Build configuration saved successfully.
              </Alert>
              <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Close
                </Button>
                <Button type="button" onClick={() => void onDone()}>
                  Finish onboarding
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
