import { Injectable } from '@nestjs/common';
import { DeploymentStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';

export type ResolvedMonitoringServer = {
  host: string;
  monitoringInstalledAt: Date | null;
};

/**
 * Résout, pour un service-environnement, le SERVEUR dont dépendent les URLs
 * Grafana/Prometheus/Loki — dans cet ordre :
 *   1. `resolvedRefs.serverId` du dernier déploiement SUCCESS de ce
 *      service-env — la référence FIGÉE au moment du déploiement (même champ
 *      que ReconcilerService/rollback), garantie alignée avec le serveur qui
 *      héberge réellement les conteneurs en cours.
 *   2. Sinon, le binding *actuel* du service-env (serverId explicite, sinon
 *      1er serveur de l'environnement) — comportement historique, utilisé
 *      tant qu'aucun déploiement réussi n'existe encore.
 * Centralisé ici pour que les liens (getMonitoringLinksForServiceEnv), les
 * métriques (getServiceMetricRange) et les logs (queryServiceLogs) résolvent
 * TOUS le même serveur, au lieu de la config Prometheus/Loki globale figée
 * sur le premier serveur ayant eu la stack installée.
 */
@Injectable()
export class MonitoringServerResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    serviceEnvId: string,
  ): Promise<ResolvedMonitoringServer | null> {
    const fromDeployment =
      await this.resolveFromLastSuccessfulDeployment(serviceEnvId);
    if (fromDeployment) return fromDeployment;

    const serviceEnv = await this.prisma.serviceEnvironment.findUnique({
      where: { id: serviceEnvId },
      select: {
        environmentId: true,
        server: { select: { host: true, monitoringInstalledAt: true } },
      },
    });
    if (!serviceEnv) return null;

    return (
      serviceEnv.server ??
      (await this.prisma.server.findFirst({
        where: { environmentId: serviceEnv.environmentId, archivedAt: null },
        select: { host: true, monitoringInstalledAt: true },
      }))
    );
  }

  private async resolveFromLastSuccessfulDeployment(
    serviceEnvId: string,
  ): Promise<ResolvedMonitoringServer | null> {
    const lastSuccess = await this.prisma.deployment.findFirst({
      where: { serviceEnvId, status: DeploymentStatus.SUCCESS },
      orderBy: { createdAt: 'desc' },
      select: { resolvedRefs: true },
    });
    const serverId = (lastSuccess?.resolvedRefs as { serverId?: string } | null)
      ?.serverId;
    if (!serverId) return null;
    return this.prisma.server.findUnique({
      where: { id: serverId },
      select: { host: true, monitoringInstalledAt: true },
    });
  }
}
