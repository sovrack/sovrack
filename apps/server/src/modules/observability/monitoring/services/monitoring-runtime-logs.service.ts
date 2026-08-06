import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContainerStatus, Role } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type { IDockerRuntime } from '../../../../adapters/container-runtime/ports/docker-runtime.port';
import { DOCKER_RUNTIME } from '../../../../adapters/container-runtime/ports/docker-runtime.port';
import {
  MonitoringLokiService,
  type LokiSearchResult,
} from './monitoring-loki.service';
import { MonitoringServerResolverService } from './monitoring-server-resolver.service';

export type RuntimeLogLine = { stream: 'stdout' | 'stderr'; line: string };
export type RuntimeLogResult = {
  container: string;
  total: number;
  matched: number;
  lines: RuntimeLogLine[];
};

type SearchOptions = {
  tail?: number;
  search?: string;
  stream?: 'stdout' | 'stderr' | 'all';
};

/**
 * Centralized runtime-log search for a service-environment's running container.
 * Pragmatic app-side implementation (no external log stack): pulls the last N
 * lines via the Docker API and applies server-side filtering (text + stream).
 * Gives the "Observability / search logs" capability without a heavy ingestion
 * pipeline; a persistent store can be layered later if volume requires it.
 */
@Injectable()
export class MonitoringRuntimeLogsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCKER_RUNTIME) private readonly docker: IDockerRuntime,
    private readonly loki: MonitoringLokiService,
    private readonly serverResolver: MonitoringServerResolverService,
  ) {}

  /**
   * Recherche dans les logs HISTORIQUES (Loki) d'un service×env. Même contrôle
   * d'accès que le tail live. Si Loki n'est pas configuré, le résultat porte
   * `configured=false` → le frontend bascule sur {@link searchServiceLogs}.
   */
  async searchPersistedLogs(
    serviceEnvId: string,
    userId: string,
    userRole: Role,
    opts: { from?: Date; to?: Date; search?: string; limit?: number },
  ): Promise<LokiSearchResult> {
    await this.assertCanAccess(serviceEnvId, userId, userRole);
    const server = await this.serverResolver.resolve(serviceEnvId);
    const lokiUrlOverride = server?.monitoringInstalledAt
      ? `http://${server.host}:3100`
      : undefined;
    return this.loki.queryServiceLogs(serviceEnvId, {
      ...opts,
      lokiUrlOverride,
    });
  }

  async searchServiceLogs(
    serviceEnvId: string,
    userId: string,
    userRole: Role,
    opts: SearchOptions,
  ): Promise<RuntimeLogResult> {
    await this.assertCanAccess(serviceEnvId, userId, userRole);

    const container = await this.prisma.container.findFirst({
      where: { serviceEnvId, status: ContainerStatus.RUNNING },
      orderBy: { updatedAt: 'desc' },
      select: { serverId: true, name: true },
    });
    if (!container) {
      throw new BadRequestException(
        'Aucun conteneur en cours d’exécution pour ce service.',
      );
    }

    const tail = Math.min(Math.max(opts.tail ?? 500, 1), 5000);
    const collected: RuntimeLogLine[] = [];
    for await (const entry of this.docker.streamContainerLogs(
      container.serverId,
      container.name,
      { follow: false, tail },
    )) {
      collected.push(entry);
    }

    const search = opts.search?.trim().toLowerCase();
    const streamFilter =
      opts.stream && opts.stream !== 'all' ? opts.stream : null;
    const lines = collected.filter(
      (e) =>
        (!streamFilter || e.stream === streamFilter) &&
        (!search || e.line.toLowerCase().includes(search)),
    );

    return {
      container: container.name,
      total: collected.length,
      matched: lines.length,
      lines,
    };
  }

  private async assertCanAccess(
    serviceEnvId: string,
    userId: string,
    _userRole: Role,
  ): Promise<void> {
    const env = await this.prisma.serviceEnvironment.findUnique({
      where: { id: serviceEnvId },
      select: { service: { select: { projectId: true } } },
    });
    if (!env) throw new NotFoundException('Service-environnement introuvable');

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: env.service.projectId, userId } },
      select: { role: true },
    });
    if (!member) throw new ForbiddenException('Accès non autorisé à ce projet');
  }
}
