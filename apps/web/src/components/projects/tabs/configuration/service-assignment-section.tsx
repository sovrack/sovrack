'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, ChevronDown, ChevronRight, Loader2, Plus } from 'lucide-react';
import { environmentsService } from '@/services/environments.service';
import { getApiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CreateServiceWizard } from '@/components/projects/create-service-wizard';
import type { Environment } from '@/types/environment';

const ENV_BADGE_CFG: Record<string, string> = {
  PRODUCTION: 'border-red-500/30 bg-red-500/10 text-red-400',
  STAGING:    'border-blue-500/30 bg-blue-500/10 text-blue-400',
  TESTING:    'border-amber-500/30 bg-amber-500/10 text-amber-400',
  PREVIEW:    'border-purple-500/30 bg-purple-500/10 text-purple-400',
};

const SERVICE_TYPE_COLORS: Record<string, string> = {
  APPLICATION: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  DATABASE: 'border-red-500/30 bg-red-500/10 text-red-400',
  COMPOSE: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  OTHER: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
};

const BUILD_PACK_COLORS: Record<string, string> = {
  DOCKERFILE: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  DOCKER_COMPOSE: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  NIXPACKS: 'border-green-500/30 bg-green-500/10 text-green-400',
  BUILDPACK: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  STATIC: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  NONE: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
};

export function ServiceAssignmentSection({ projectId }: { projectId: string }) {
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEnvId, setExpandedEnvId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    environmentsService.getAll(projectId)
      .then((e) => {
        if (!mountedRef.current) return;
        setEnvs(e);
        if (e.length > 0 && !expandedEnvId) setExpandedEnvId(e[0].id);
      })
      .catch((err) => { if (mountedRef.current) setError(getApiErrorMessage(err)); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [projectId, expandedEnvId]);

  useEffect(() => { mountedRef.current = true; load(); return () => { mountedRef.current = false; }; }, [load]);

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
      <Loader2 size={13} className="animate-spin" /> Loading…
    </div>
  );

  if (error) return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-400">
      Failed to load: {error}
    </div>
  );

  if (envs.length === 0) return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] py-10 text-center">
      <Box size={24} className="mb-2 text-[var(--text-muted)]" />
      <p className="text-sm font-semibold text-[var(--text-primary)]">No environments yet</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">Add environments first in the Environments section.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-muted)]">Services are deployed per environment. Configure service settings (port, healthcheck, env) below.</p>
        <Button size="sm" icon={<Plus size={13} />} onClick={() => setWizardOpen(true)}>
          New service
        </Button>
      </div>
      <CreateServiceWizard
        projectId={projectId}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={load}
      />
      <div className="space-y-2 pt-1">
        {envs.map((env) => {
          const open = expandedEnvId === env.id;
          const envServices = env.serviceLinks ?? [];
          return (
            <div key={env.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)]">
              <button type="button" onClick={() => setExpandedEnvId(open ? null : env.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ENV_BADGE_CFG[env.name] ?? 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'}`}>
                    {env.name}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{envServices.length} service{envServices.length !== 1 ? 's' : ''}</span>
                </div>
                {open ? <ChevronDown size={13} className="text-[var(--text-muted)]" /> : <ChevronRight size={13} className="text-[var(--text-muted)]" />}
              </button>
              {open && (
                <div className="border-t border-[var(--border)] px-4 pb-4 pt-3">
                  {envServices.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">No services in this environment yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {envServices.map((link) => (
                        <div key={link.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
                          <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">{link.service?.name ?? '?'}</span>
                          {link.service?.type && (
                            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${SERVICE_TYPE_COLORS[link.service.type] ?? 'text-zinc-400'}`}>
                              {link.service.type}
                            </span>
                          )}
                          {link.service?.buildPack && (
                            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${BUILD_PACK_COLORS[link.service.buildPack] ?? ''}`}>
                              {link.service.buildPack}
                            </span>
                          )}
                          {link.service?.port && <span className="font-mono text-[10px] text-[var(--text-muted)]">:{link.service.port}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
