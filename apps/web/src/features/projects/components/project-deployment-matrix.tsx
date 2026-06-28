'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Boxes,
  Database,
  Loader2,
  Plus,
  Rocket,
  RotateCcw,
  Unlink2,
} from 'lucide-react';
import { useProjectMatrix } from '@/features/projects/api/use-project-matrix';
import type {
  MatrixCellStatus,
  ProjectMatrixCell,
} from '@/features/projects/api/projects.service';
import { deploymentsService } from '@/features/deployments';
import { environmentsService } from '@/features/projects/api/environments.service';
import { useConfirm } from '@/shared/contexts/confirm-context';
import { getApiErrorMessage } from '@/shared/lib/api';

/**
 * Matrice de déploiement : LIGNES = services, COLONNES = environnements,
 * CELLULE = un ServiceEnvironment (service × env) avec l'état de sa release
 * courante + OutOfSync, et les actions Deploy / Rollback CIBLÉES sur la cellule.
 * Projection 1:1 du modèle M:N : l'unité d'action est la CELLULE, pas le service.
 */

const STATUS_META: Record<
  Exclude<MatrixCellStatus, null>,
  { dot: string; label: string; pulse?: boolean }
> = {
  SUCCESS: { dot: 'bg-green-500', label: 'Live' },
  RUNNING: { dot: 'bg-blue-500', label: 'Running', pulse: true },
  PENDING: { dot: 'bg-amber-500', label: 'Pending', pulse: true },
  FAILED: { dot: 'bg-red-500', label: 'Failed' },
  CANCELED: { dot: 'bg-zinc-500', label: 'Canceled' },
};

/** Un rollback n'a de sens que sur une release terminée. */
function canRollback(cell: ProjectMatrixCell): boolean {
  return (
    Boolean(cell.currentDeploymentId) &&
    (cell.status === 'SUCCESS' || cell.status === 'FAILED')
  );
}

function Cell({
  projectId,
  serviceId,
  environmentId,
  serviceName,
  environmentName,
  cell,
  busy,
  linking,
  unlinking,
  onDeploy,
  onRollback,
  onLink,
  onUnlink,
}: {
  projectId: string;
  serviceId: string;
  environmentId: string;
  serviceName: string;
  environmentName: string;
  cell: ProjectMatrixCell | undefined;
  busy: boolean;
  linking: boolean;
  unlinking: boolean;
  onDeploy: (serviceEnvId: string) => void;
  onRollback: (currentDeploymentId: string) => void;
  onLink: (serviceId: string, environmentId: string) => void;
  onUnlink: (serviceEnvId: string, serviceName: string, environmentName: string) => void;
}) {
  // Pas de cellule = service non lié à cet environnement → 1 clic pour le lier
  // (crée le ServiceEnvironment), puis la cellule devient déployable.
  if (!cell) {
    return (
      <div className="flex h-full min-h-[64px] items-center justify-center">
        <button
          type="button"
          disabled={linking}
          onClick={() => onLink(serviceId, environmentId)}
          title="Link this service to this environment"
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--border)] px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)] transition hover:border-[var(--text-primary)]/30 hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          {linking ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Plus size={11} />
          )}
          Link
        </button>
      </div>
    );
  }

  const meta = cell.status ? STATUS_META[cell.status] : null;

  return (
    <div className="flex h-full min-h-[64px] flex-col justify-center gap-1.5 px-3 py-2">
      <Link
        href={`/projects/${projectId}/services/${cell.serviceId}`}
        className="flex items-center gap-2 transition hover:opacity-80"
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            meta ? meta.dot : 'border border-[var(--border)] bg-transparent'
          } ${meta?.pulse ? 'animate-pulse' : ''}`}
        />
        <span className="text-xs font-medium text-[var(--text-primary)]">
          {meta ? meta.label : 'Never deployed'}
        </span>
        {cell.outOfSync && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
            <AlertTriangle size={9} /> OutOfSync
          </span>
        )}
      </Link>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => onDeploy(cell.serviceEnvId)}
          title="Deploy this cell"
          className="inline-flex items-center gap-1 rounded-md bg-[var(--text-primary)] px-2 py-1 text-[10px] font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <Rocket size={10} />
          )}
          Deploy
        </button>
        {canRollback(cell) && cell.currentDeploymentId && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRollback(cell.currentDeploymentId as string)}
            title="Roll back to the previous deployment"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <RotateCcw size={10} /> Rollback
          </button>
        )}
        <button
          type="button"
          disabled={unlinking}
          onClick={() => onUnlink(cell.serviceEnvId, serviceName, environmentName)}
          title="Unlink this service from this environment"
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
        >
          {unlinking ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Unlink2 size={11} />
          )}
        </button>
      </div>
    </div>
  );
}

export function ProjectDeploymentMatrix({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useProjectMatrix(projectId);
  const confirm = useConfirm();
  const [busyCells, setBusyCells] = useState<Set<string>>(new Set());
  const [busyLinks, setBusyLinks] = useState<Set<string>>(new Set());
  const [busyUnlinks, setBusyUnlinks] = useState<Set<string>>(new Set());
  const [busyColumn, setBusyColumn] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; msg: string } | null>(
    null,
  );

  const setBusy = (serviceEnvId: string, on: boolean) =>
    setBusyCells((prev) => {
      const next = new Set(prev);
      if (on) next.add(serviceEnvId);
      else next.delete(serviceEnvId);
      return next;
    });

  const handleDeploy = async (serviceEnvId: string) => {
    setBusy(serviceEnvId, true);
    setNotice(null);
    try {
      await deploymentsService.create({ serviceEnvId });
      setNotice({ tone: 'ok', msg: 'Deployment started.' });
      await refetch();
    } catch (e) {
      setNotice({ tone: 'err', msg: getApiErrorMessage(e) });
    } finally {
      setBusy(serviceEnvId, false);
    }
  };

  const handleRollback = async (currentDeploymentId: string) => {
    setNotice(null);
    try {
      await deploymentsService.rollback(currentDeploymentId);
      setNotice({ tone: 'ok', msg: 'Rollback started.' });
      await refetch();
    } catch (e) {
      setNotice({ tone: 'err', msg: getApiErrorMessage(e) });
    }
  };

  // Lie un service à un environnement (crée le ServiceEnvironment) → la cellule
  // « Non lié » devient déployable, le tout sans quitter la matrice.
  const handleLink = async (serviceId: string, environmentId: string) => {
    const key = `${serviceId}:${environmentId}`;
    setBusyLinks((prev) => new Set(prev).add(key));
    setNotice(null);
    try {
      await environmentsService.linkService(projectId, environmentId, serviceId);
      setNotice({ tone: 'ok', msg: 'Service linked to the environment.' });
      await refetch();
    } catch (e) {
      setNotice({ tone: 'err', msg: getApiErrorMessage(e) });
    } finally {
      setBusyLinks((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // Délie un service d'un environnement (soft-delete du ServiceEnvironment :
  // l'historique de déploiement est préservé). Confirmation obligatoire.
  const handleUnlink = async (
    serviceEnvId: string,
    serviceName: string,
    environmentName: string,
  ) => {
    const ok = await confirm({
      title: `Unlink ${serviceName} from ${environmentName}?`,
      description:
        'The service is removed from this environment (deployment history is kept). You can re-link it later.',
      confirmLabel: 'Unlink',
      variant: 'danger',
    });
    if (!ok) return;
    setBusyUnlinks((prev) => new Set(prev).add(serviceEnvId));
    setNotice(null);
    try {
      await environmentsService.unlinkService(projectId, serviceEnvId);
      setNotice({ tone: 'ok', msg: 'Service unlinked from the environment.' });
      await refetch();
    } catch (e) {
      setNotice({ tone: 'err', msg: getApiErrorMessage(e) });
    } finally {
      setBusyUnlinks((prev) => {
        const next = new Set(prev);
        next.delete(serviceEnvId);
        return next;
      });
    }
  };

  // « Deploy all » d'une colonne : déploie chaque cellule liée de l'environnement.
  const handleDeployColumn = async (
    environmentId: string,
    cellsInColumn: ProjectMatrixCell[],
  ) => {
    if (cellsInColumn.length === 0) return;
    setBusyColumn(environmentId);
    setNotice(null);
    const results = await Promise.allSettled(
      cellsInColumn.map((c) => deploymentsService.create({ serviceEnvId: c.serviceEnvId })),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    setNotice(
      failed > 0
        ? { tone: 'err', msg: `${failed}/${cellsInColumn.length} deployment(s) failed.` }
        : { tone: 'ok', msg: `${cellsInColumn.length} deployment(s) started.` },
    );
    await refetch();
    setBusyColumn(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-10 text-sm text-[var(--text-secondary)]">
        <Loader2 size={15} className="animate-spin" /> Loading matrix…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        {getApiErrorMessage(error)}
      </div>
    );
  }

  const services = data?.services ?? [];
  const environments = data?.environments ?? [];
  const cells = data?.cells ?? [];

  const cellByKey = new Map<string, ProjectMatrixCell>();
  for (const c of cells) cellByKey.set(`${c.serviceId}:${c.environmentId}`, c);
  const cellsByEnv = (envId: string) =>
    cells.filter((c) => c.environmentId === envId);

  if (services.length === 0 || environments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-14 text-center">
        <Boxes size={28} className="mb-3 text-[var(--text-muted)]" />
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Empty matrix
        </p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {services.length === 0 ? 'Add a service.' : 'Create an environment.'}{' '}
          The matrix shows every service × environment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notice && (
        <div
          className={`rounded-xl border px-4 py-2.5 text-sm ${
            notice.tone === 'ok'
              ? 'border-green-500/30 bg-green-500/10 text-green-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {notice.msg}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="sticky left-0 z-10 bg-[var(--bg-card)] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Service
              </th>
              {environments.map((env) => {
                const colCells = cellsByEnv(env.id);
                return (
                  <th
                    key={env.id}
                    className="min-w-[170px] px-3 py-3 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                        {env.name}
                        {env.isProtected && (
                          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-400">
                            prod
                          </span>
                        )}
                      </span>
                      {colCells.length > 0 && (
                        <button
                          type="button"
                          disabled={busyColumn === env.id}
                          onClick={() => void handleDeployColumn(env.id, colCells)}
                          title={`Deploy all ${colCells.length} services in ${env.name}`}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-1.5 py-1 text-[10px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
                        >
                          {busyColumn === env.id ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <Rocket size={10} />
                          )}
                          All
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {services.map((svc) => (
              <tr
                key={svc.id}
                className="border-b border-[var(--border)] last:border-0"
              >
                <th className="sticky left-0 z-10 bg-[var(--bg-card)] px-4 py-2 text-left">
                  <Link
                    href={`/projects/${projectId}/services/${svc.id}`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-primary)] hover:underline"
                  >
                    {svc.type === 'DATABASE' ? (
                      <Database size={14} className="text-[var(--text-muted)]" />
                    ) : (
                      <Boxes size={14} className="text-[var(--text-muted)]" />
                    )}
                    {svc.name}
                  </Link>
                </th>
                {environments.map((env) => {
                  const cell = cellByKey.get(`${svc.id}:${env.id}`);
                  return (
                    <td
                      key={env.id}
                      className="border-l border-[var(--border)] px-1 align-middle"
                    >
                      <Cell
                        projectId={projectId}
                        serviceId={svc.id}
                        environmentId={env.id}
                        serviceName={svc.name}
                        environmentName={env.name}
                        cell={cell}
                        busy={cell ? busyCells.has(cell.serviceEnvId) : false}
                        linking={busyLinks.has(`${svc.id}:${env.id}`)}
                        unlinking={cell ? busyUnlinks.has(cell.serviceEnvId) : false}
                        onDeploy={(id) => void handleDeploy(id)}
                        onRollback={(id) => void handleRollback(id)}
                        onLink={(s, e) => void handleLink(s, e)}
                        onUnlink={(id, s, e) => void handleUnlink(id, s, e)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
