'use client';

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import type { BuildStatusResult, BuildAllResult } from '@/services/build.service';
import type { Service } from '@/types/service';
import { ServiceConfigPanel } from './service-config-panel';

type BuildServiceStatus = BuildStatusResult['services'][number];
export type MergedService = Service & { status?: BuildServiceStatus };

type BuildServiceTableProps = {
  projectId: string;
  isAdmin: boolean;
  services: Service[];
  mergedServices: MergedService[];
  servicesLoading: boolean;
  selectedIds: Set<string>;
  expandedId: string | null;
  detectAllRunning: boolean;
  prepareAllRunning: boolean;
  prepareAllResults: BuildAllResult[] | null;
  onToggleAll: () => void;
  onToggleSelect: (id: string) => void;
  onDetectAll: () => void;
  onPrepareAll: () => void;
  onExpandChange: (id: string | null) => void;
  onServiceGenerated: () => void;
};

/** Service table for GROUP sources (list + per-service inline config). */
export function BuildServiceTable({
  projectId,
  isAdmin,
  services,
  mergedServices,
  servicesLoading,
  selectedIds,
  expandedId,
  detectAllRunning,
  prepareAllRunning,
  prepareAllResults,
  onToggleAll,
  onToggleSelect,
  onDetectAll,
  onPrepareAll,
  onExpandChange,
  onServiceGenerated,
}: BuildServiceTableProps) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      {/* Table header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selectedIds.size === services.length && services.length > 0}
            onChange={onToggleAll}
            className="h-4 w-4 rounded accent-[var(--text-primary)]"
          />
          <p className="text-sm font-semibold text-[var(--text-primary)]">Services</p>
          <span className="rounded-full bg-[var(--hover)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
            {services.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onDetectAll()}
            disabled={detectAllRunning || !isAdmin}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            {detectAllRunning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Détecter tout
          </button>
          <Button
            onClick={() => void onPrepareAll()}
            disabled={prepareAllRunning || !isAdmin}
            loading={prepareAllRunning}
          >
            <span className="text-xs">
              {selectedIds.size > 0 ? `Générer (${selectedIds.size})` : 'Générer tout'}
            </span>
          </Button>
        </div>
      </div>

      {servicesLoading ? (
        <div className="space-y-2 p-4">{[1,2,3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--hover)]" />)}</div>
      ) : services.length === 0 ? (
        <div className="p-8 text-center text-sm text-[var(--text-muted)]">
          Aucun service. Ajoutez des services dans l&apos;onglet <strong>Services</strong>.
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {mergedServices.map((svc) => {
            const isExpanded = expandedId === svc.id;
            const pipeline = svc.status?.lastPipeline;
            const isReady = svc.status?.ready;
            const pipelineColor =
              pipeline?.status === 'success' ? 'text-green-400 bg-green-500/10 border-green-500/20'
              : pipeline?.status === 'failed'  ? 'text-red-400 bg-red-500/10 border-red-500/20'
              : pipeline?.status === 'running' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
              : 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';

            return (
              <div key={svc.id}>
                {/* Service row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(svc.id)}
                    onChange={() => onToggleSelect(svc.id)}
                    className="h-4 w-4 shrink-0 rounded accent-[var(--text-primary)]"
                  />

                  {/* Status dot */}
                  <div className={clsx(
                    'h-2 w-2 shrink-0 rounded-full',
                    isReady ? 'bg-green-400' : 'bg-amber-400',
                  )} />

                  {/* Service info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{svc.name}</p>
                      <span className="rounded bg-[var(--hover)] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[var(--text-muted)]">{svc.type}</span>
                      {svc.buildPack && svc.buildPack !== 'DOCKERFILE' && (
                        <span className="rounded border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-purple-300">{svc.buildPack}</span>
                      )}
                    </div>
                    <p className="font-mono text-[10px] text-[var(--text-muted)]">{svc.name}</p>
                  </div>

                  {/* Pipeline status */}
                  <div className="shrink-0">
                    {pipeline ? (
                      <div className="flex items-center gap-1.5">
                        <span className={clsx('rounded-full border px-2 py-0.5 text-[10px] font-semibold', pipelineColor)}>
                          {pipeline.status}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">#{pipeline.id}</span>
                        {pipeline.webUrl && (
                          <a href={pipeline.webUrl} target="_blank" rel="noreferrer" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-[var(--text-muted)]">Aucun pipeline</span>
                    )}
                  </div>

                  {/* Expand toggle */}
                  <button
                    type="button"
                    onClick={() => onExpandChange(isExpanded ? null : svc.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                  >
                    {isExpanded ? <><ChevronUp size={12} /> Fermer</> : <><ChevronDown size={12} /> Configurer</>}
                  </button>
                </div>

                {/* Inline config panel */}
                {isExpanded && (
                  <div className="px-4 pb-4">
                    <ServiceConfigPanel
                      service={svc}
                      isAdmin={isAdmin}
                      projectId={projectId}
                      initialConfig={{
                        engine: svc.buildPack ?? 'DOCKERFILE',
                        port: '3000',
                        startCmd: 'node dist/main.js',
                        type: 'nodejs',
                      }}
                      onClose={() => onExpandChange(null)}
                      onGenerated={() => { onServiceGenerated(); }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Prepare all results */}
      {prepareAllResults && (
        <div className="border-t border-[var(--border)] p-4 space-y-1.5">
          <p className="text-xs font-semibold text-[var(--text-secondary)]">Résultats :</p>
          {prepareAllResults.map((r) => (
            <div key={r.serviceId} className="flex items-center gap-2 rounded-lg bg-[var(--hover)] px-3 py-2">
              {r.status === 'SUCCESS' ? <CheckCircle2 size={13} className="text-green-400" /> : <XCircle size={13} className="text-red-400" />}
              <span className="text-xs font-semibold text-[var(--text-primary)]">{r.serviceName}</span>
              <span className="text-xs text-[var(--text-muted)]">· Dockerfile: {r.dockerfileStatus} · CI: {r.ciStatus}</span>
              {r.pipelineUrl && (
                <a href={r.pipelineUrl} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-xs text-blue-300">
                  Pipeline <ExternalLink size={10} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
