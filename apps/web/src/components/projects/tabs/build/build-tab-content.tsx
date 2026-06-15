'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Rocket } from 'lucide-react';
import {
  buildService,
  type BuildStatusResult,
  type BuildAllResult,
} from '@/services/build.service';
import type { Service } from '@/types/service';
import { getApiErrorMessage } from '@/lib/api';
import { BuildStatusPanel } from './build-status-panel';
import { RepoBuildConfig } from './repo-build-config';
import { BuildServiceTable, type MergedService } from './build-service-table';

export type ProjectBuildTabContentProps = {
  projectId: string;
  isAdmin: boolean;
  sourceType?: string | null;
  hasEnvironment?: boolean;
  onGoToEnvironments?: () => void;
  onDeploy?: () => void;
};

const STEPS = [
  { id: 1, label: '① Détecter',  desc: 'Framework' },
  { id: 2, label: '② Préparer',  desc: 'Dockerfile + CI' },
  { id: 3, label: '③ Vérifier',  desc: 'Pipeline' },
  { id: 4, label: '④ Déployer',  desc: 'Production' },
];

/** Orchestrator for the project Build tab: status, stepper, source-specific config, CTA. */
export function ProjectBuildTabContent({
  projectId,
  isAdmin,
  sourceType,
  hasEnvironment = true,
  onGoToEnvironments,
  onDeploy,
}: ProjectBuildTabContentProps) {
  const isGroupSource = sourceType === 'GROUP';

  const [services, setServices]         = useState<Service[]>([]);
  const [buildStatus, setBuildStatus]   = useState<BuildStatusResult | null>(null);
  const [buildStatusLoading, setBuildStatusLoading] = useState(false);
  const [servicesLoading, setServicesLoading]       = useState(false);

  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [prepareAllRunning,  setPrepareAllRunning]  = useState(false);
  const [prepareAllResults,  setPrepareAllResults]  = useState<BuildAllResult[] | null>(null);
  const [detectAllRunning,   setDetectAllRunning]   = useState(false);
  const [error,              setError]              = useState<string | null>(null);
  const [successMsg,         setSuccessMsg]         = useState<string | null>(null);

  const statusLoadRef = useRef<string | null>(null);

  const refreshBuildStatus = useCallback(() => {
    setBuildStatusLoading(true);
    buildService.getBuildStatus(projectId)
      .then(setBuildStatus)
      .catch(() => { /* ignore */ })
      .finally(() => setBuildStatusLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (statusLoadRef.current === projectId) return;
    statusLoadRef.current = projectId;
    refreshBuildStatus();
    if (!isGroupSource) return;
    setServicesLoading(true);
    // TODO: load services from environments
    setServices([]);
    setServicesLoading(false);
  }, [projectId, isGroupSource, refreshBuildStatus]);

  /* ── Merge service data ─────────────────────────────────────────── */
  const mergedServices: MergedService[] = services.map((svc) => {
    const status = buildStatus?.services.find((s) => s.id === svc.id);
    return { ...svc, status };
  });

  /* ── Handlers ─────────────────────────────────────────────────────── */

  const handleDetectAll = async () => {
    setDetectAllRunning(true); setError(null); setSuccessMsg(null);
    try {
      const results: Array<{ id: string; result: string }> = [];
      for (const svc of services) {
        try {
          const r = await buildService.detect(projectId, svc.id);
          results.push({ id: svc.id, result: `${r.recommendedBuildType || r.type} · port ${r.recommendedPort}` });
        } catch { results.push({ id: svc.id, result: 'Échec détection' }); }
      }
      setSuccessMsg(`Détection terminée pour ${String(results.length)} service(s).`);
    } finally {
      setDetectAllRunning(false);
    }
  };

  const handlePrepareAll = async () => {
    setPrepareAllRunning(true); setError(null); setSuccessMsg(null); setPrepareAllResults(null);
    try {
      const res = await buildService.prepareAll(projectId);
      setPrepareAllResults(res.results);
      const failed = res.results.filter((r) => r.status === 'FAILED');
      if (failed.length === 0) setSuccessMsg(`${String(res.results.length)} service(s) préparés avec succès.`);
      else setError(`${String(failed.length)} service(s) en échec.`);
      refreshBuildStatus();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setPrepareAllRunning(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === services.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(services.map((s) => s.id)));
  };

  /* ── Build phase stepper ─────────────────────────────────────────── */
  const allReady = buildStatus && buildStatus.services.length > 0 && buildStatus.services.every((s) => s.ready);
  const hasSuccess = buildStatus?.services.some((s) => s.lastPipeline?.status === 'success');
  const buildPhase = hasSuccess ? 4 : allReady ? 3 : 2;

  return (
    <div className="space-y-6">
      {/* Environment warning */}
      {!hasEnvironment && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-amber-300">Aucun environnement configuré</p>
            <p className="text-xs text-amber-400/70">Configurez un VPS dans l&apos;onglet Environments avant de déployer.</p>
          </div>
          {onGoToEnvironments && (
            <button type="button" onClick={onGoToEnvironments} className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/30">
              Configurer →
            </button>
          )}
        </div>
      )}

      {/* Stepper */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-1">
        <div className="grid grid-cols-4 gap-1">
          {STEPS.map((s) => {
            const done = s.id < buildPhase;
            const active = s.id === buildPhase;
            return (
              <div key={s.id} className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-center transition ${active ? 'bg-[var(--bg-card)] shadow-sm' : done ? 'opacity-70' : 'opacity-40'}`}>
                <span className={`text-xs font-bold ${done ? 'text-green-400' : active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                  {done ? '✓ ' : ''}{s.label}
                </span>
                <span className="hidden text-[10px] text-[var(--text-muted)] sm:block">{s.desc}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
          <div className="h-1 rounded-full bg-green-500 transition-all duration-500" style={{ width: `${Math.max(5, (buildPhase - 1) * 33)}%` }} />
        </div>
      </div>

      {error    && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          <CheckCircle size={15} /> {successMsg}
        </div>
      )}

      <BuildStatusPanel buildStatus={buildStatus} buildStatusLoading={buildStatusLoading} onRefresh={refreshBuildStatus} />

      {/* ── Service table (GROUP source) ─────────────────────────── */}
      {isGroupSource && (
        <BuildServiceTable
          projectId={projectId}
          isAdmin={isAdmin}
          services={services}
          mergedServices={mergedServices}
          servicesLoading={servicesLoading}
          selectedIds={selectedIds}
          expandedId={expandedId}
          detectAllRunning={detectAllRunning}
          prepareAllRunning={prepareAllRunning}
          prepareAllResults={prepareAllResults}
          onToggleAll={toggleAll}
          onToggleSelect={toggleSelect}
          onDetectAll={() => void handleDetectAll()}
          onPrepareAll={() => void handlePrepareAll()}
          onExpandChange={setExpandedId}
          onServiceGenerated={refreshBuildStatus}
        />
      )}

      {/* ── REPO source — interactive build config ────────────────── */}
      {!isGroupSource && (
        <RepoBuildConfig
          projectId={projectId}
          isAdmin={isAdmin}
          prepareAllResults={prepareAllResults}
          onGenerated={refreshBuildStatus}
        />
      )}

      {/* ── CTA Déployer ──────────────────────────────────────────── */}
      {allReady && hasEnvironment && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-green-500/30 bg-green-500/5 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-green-300">✅ Build configuré — Prêt à déployer</p>
            <p className="mt-0.5 text-xs text-green-400/70">Tous les services ont un Dockerfile et un pipeline CI configurés.</p>
          </div>
          <button
            type="button"
            onClick={onDeploy}
            className="shrink-0 flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] shadow transition hover:opacity-90"
          >
            <Rocket size={14} /> Déployer maintenant
          </button>
        </div>
      )}
      {allReady && !hasEnvironment && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-amber-300">✅ Build prêt — Environnement manquant</p>
            <p className="mt-0.5 text-xs text-amber-400/70">Configurez un VPS dans l&apos;onglet Environments pour déployer.</p>
          </div>
          {onGoToEnvironments && (
            <button type="button" onClick={onGoToEnvironments}
              className="shrink-0 rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/25">
              Configurer l&apos;env →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
