import { Inject, Injectable, Logger } from '@nestjs/common';
import { ContainerStatus, Server, ServiceType } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { IDockerRuntime } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DOCKER_RUNTIME } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { TraefikRouteService } from './traefik-route.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';

export type TraefikConfig = {
  traefikDomain: string | null;
  traefikServiceEnvId: string | null;
  useTraefik: boolean;
};

@Injectable()
export class DeployRoutingService {
  private static readonly BLUE_GREEN_DRAIN_MS = 3000;
  private readonly logger = new Logger(DeployRoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly traefik: TraefikRouteService,
    @Inject(DOCKER_RUNTIME) private readonly docker: IDockerRuntime,
    private readonly gateway: DeploymentEventsPublisher,
  ) {}

  /**
   * Resolve the Traefik domain for a deployment: first checks explicit domain
   * records, then falls back to an auto-generated subdomain for APPLICATION
   * services when no domain is attached.
   */
  async resolveTraefikConfig(
    deployment: {
      project: { id: string };
      service?: { type?: ServiceType | null } | null;
      serviceEnv?: {
        id: string;
        environment?: { name?: string | null } | null;
      } | null;
    },
    servers: { host?: string | null }[],
    serviceName: string,
  ): Promise<TraefikConfig> {
    const traefikServiceEnvId = deployment.serviceEnv?.id ?? null;

    let traefikDomain =
      traefikServiceEnvId && deployment.service?.type !== ServiceType.DATABASE
        ? ((
            await this.prisma.domain.findFirst({
              where: { serviceEnvId: traefikServiceEnvId },
              orderBy: { createdAt: 'desc' },
              select: { name: true },
            })
          )?.name ?? null)
        : null;

    if (
      !traefikDomain &&
      traefikServiceEnvId &&
      deployment.service?.type === ServiceType.APPLICATION
    ) {
      const auto = await this.traefik.resolveAutoSubdomain(
        deployment.project.id,
        traefikServiceEnvId,
        serviceName,
        deployment.serviceEnv?.environment?.name ?? 'env',
        servers[0]?.host ?? undefined,
      );
      if (auto) traefikDomain = auto;
    }

    return {
      traefikDomain,
      traefikServiceEnvId,
      useTraefik: !!traefikDomain,
    };
  }

  /**
   * Apply the Traefik reverse-proxy route after the container is healthy.
   * Errors are non-fatal: logged to the deployment stream but do not abort
   * the deploy (the container is already running).
   */
  async applyRoute(params: {
    deploymentId: string;
    serverId: string;
    server: Server;
    serviceEnvId: string;
    traefikDomain: string;
    /** Single name (backwards compat) or all replica names for round-robin. */
    containerName?: string;
    containerNames?: string[];
    servicePort: number;
  }): Promise<string> {
    const {
      deploymentId,
      serverId,
      server,
      serviceEnvId,
      traefikDomain,
      servicePort,
    } = params;
    const names =
      params.containerNames ??
      (params.containerName ? [params.containerName] : []);

    if (names.length === 0) {
      return '[TRAEFIK] aucun conteneur à router — route ignorée\n';
    }

    try {
      const routeLog = await this.traefik.applyRoute(
        serverId,
        server,
        serviceEnvId,
        traefikDomain,
        names,
        servicePort,
      );
      this.gateway.emitLog({
        deploymentId,
        message: routeLog,
        level: 'info',
        timestamp: new Date().toISOString(),
      });
      return routeLog + '\n';
    } catch (proxyError) {
      const msg = proxyError instanceof Error ? proxyError.message : 'unknown';
      const errorMsg = `[TRAEFIK] Route non configurée: ${msg}`;
      this.gateway.emitLog({
        deploymentId,
        message: errorMsg,
        level: 'error',
        timestamp: new Date().toISOString(),
      });
      return errorMsg + '\n';
    }
  }

  /**
   * Blue-green cut-over. Green is already running and healthy on its standby
   * port. Repoint the proxy rule to it, wait for blue to drain, then retire
   * the previous (blue) container(s) of this ServiceEnvironment.
   */
  async cutoverBlueGreen(params: {
    serviceEnvId: string | null;
    serverId: string;
    greenDockerId: string;
    publishPort: number;
  }): Promise<string> {
    const { serviceEnvId, serverId, greenDockerId, publishPort } = params;

    if (!serviceEnvId)
      return '[BLUE-GREEN] Pas de service-env, cut-over ignoré\n';

    let logs = '';
    const repointed = await this.prisma.proxyRule.updateMany({
      where: { serviceEnvId, serverId },
      data: { targetPort: publishPort },
    });
    if (repointed.count > 0) {
      logs += `[BLUE-GREEN] ${repointed.count} règle(s) proxy repointée(s) vers ${publishPort}\n`;
    }

    await this.sleep(DeployRoutingService.BLUE_GREEN_DRAIN_MS);

    const blues = await this.prisma.container.findMany({
      where: {
        serviceEnvId,
        status: ContainerStatus.RUNNING,
        dockerId: { not: greenDockerId },
      },
      select: { id: true, dockerId: true, name: true },
    });
    for (const blue of blues) {
      try {
        await this.docker.removeContainer(serverId, blue.dockerId, true);
        await this.prisma.container.update({
          where: { id: blue.id },
          data: { status: ContainerStatus.EXITED },
        });
        logs += `[BLUE-GREEN] Ancien conteneur retiré : ${blue.name}\n`;
      } catch (error) {
        this.logger.warn(
          `Blue-green: could not remove old container ${blue.name}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }
    return logs;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
