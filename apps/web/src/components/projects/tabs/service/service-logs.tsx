'use client';

import { useEffect, useState } from 'react';
import { deploymentsService } from '@/services/deployments.service';
import { SectionCard } from '@/components/layout/section-card';
import { LogTerminal } from '@/components/log-terminal';
import { useDeploymentSocket } from '@/hooks/deployments/use-deployment-socket';
import type { DeploymentStatus } from '@/types/deployment';

/** Onglet Logs du service : flux WS live du dernier déploiement (+ logs bufferisés). */
export function ServiceLogs({
  deploymentId,
  initialStatus,
}: {
  deploymentId: string | null;
  initialStatus: DeploymentStatus | null;
}) {
  const [initialLogs, setInitialLogs] = useState<string | null>(null);

  useEffect(() => {
    if (!deploymentId) return;
    let alive = true;
    deploymentsService
      .getById(deploymentId)
      .then((d) => {
        if (alive) setInitialLogs((d as { logs?: string | null }).logs ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [deploymentId]);

  // Flux WebSocket en direct : pendant un déploiement actif les lignes arrivent
  // en temps réel ; sinon le hook rejoue les logs bufferisés du dernier déploiement.
  const { logs, status } = useDeploymentSocket({
    deploymentId: deploymentId ?? '',
    enabled: !!deploymentId,
    initialLogs,
    initialStatus,
  });
  const isLive = status === 'PENDING' || status === 'RUNNING';

  return (
    <SectionCard
      title="Logs du déploiement"
      description="Flux en direct du dernier déploiement (build, run, health-check, route)."
    >
      {!deploymentId ? (
        <p className="text-sm text-[var(--text-muted)]">Aucun déploiement.</p>
      ) : (
        <LogTerminal logs={logs} isLive={isLive} />
      )}
    </SectionCard>
  );
}
