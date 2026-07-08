import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ContainerStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { IDockerRuntime } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DOCKER_RUNTIME } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';

export type ServiceContainer = { id: string; name: string };

/**
 * Container swap primitives for the start-before-stop deploy (Coolify/Railway/
 * Dokploy parity), extracted from DockerDeployExecutorService so the critical
 * "keep the old container until the new one is healthy, then retire it (or
 * restore it on failure)" logic is small and unit-testable.
 */
@Injectable()
export class ContainerLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCKER_RUNTIME) private readonly docker: IDockerRuntime,
    private readonly gateway: DeploymentEventsPublisher,
  ) {}

  private emit(deploymentId: string, message: string): void {
    this.gateway.emitLog({
      deploymentId,
      message,
      level: 'info',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Throw if a DIFFERENT service already publishes our host port (clear error
   * instead of Docker's raw "port is already allocated"). Containers of THIS
   * service (same name prefix) are excluded — a redeploy reuses its own port.
   */
  async assertNoForeignPortConflict(
    serverId: string,
    containerPrefix: string,
    publishPort: number,
    publishesHostPort: boolean,
  ): Promise<string> {
    if (!publishesHostPort) return '';
    const existing = await this.docker.listContainers(serverId, true);
    const conflict = existing.find(
      (c) =>
        (c.Ports ?? []).some((p) => p.PublicPort === publishPort) &&
        !(c.Names ?? []).some((n) =>
          n.replace(/^\//, '').startsWith(containerPrefix),
        ),
    );
    if (conflict) {
      const who = (conflict.Names?.[0] ?? conflict.Id).replace(/^\//, '');
      throw new BadRequestException(
        `Le port hôte ${publishPort} est déjà utilisé sur ce serveur par le ` +
          `conteneur "${who}". Choisis un autre port pour ce service, ou ` +
          `attribue-lui un domaine (routage Traefik, sans port hôte).`,
      );
    }
    return '';
  }

  /** List existing container(s) of THIS service (name = prefix + past deploy id). */
  async listServiceContainers(
    serverId: string,
    containerPrefix: string,
  ): Promise<ServiceContainer[]> {
    const existing = await this.docker.listContainers(serverId, true);
    return existing
      .filter((c) =>
        (c.Names ?? []).some((n) =>
          n.replace(/^\//, '').startsWith(containerPrefix),
        ),
      )
      .map((c) => ({
        id: c.Id,
        name: (c.Names?.[0] ?? c.Id).replace(/^\//, ''),
      }));
  }

  /** Stop (not remove) old container(s) so the new one can bind the host port. */
  async stopContainers(
    serverId: string,
    containers: ServiceContainer[],
    deploymentId: string,
  ): Promise<string> {
    let logs = '';
    for (const c of containers) {
      this.emit(deploymentId, `Arrêt de l'ancien conteneur ${c.name}...`);
      await this.docker.stopContainer(serverId, c.id).catch(() => undefined);
      logs += `Ancien conteneur arrêté : ${c.id.slice(0, 12)}\n`;
    }
    return logs;
  }

  /** Bring previously stopped container(s) back (recovery after a failed deploy). */
  async restartContainers(
    serverId: string,
    containers: ServiceContainer[],
    deploymentId: string,
  ): Promise<string> {
    let logs = '';
    for (const c of containers) {
      this.emit(
        deploymentId,
        `Restauration de l'ancien conteneur ${c.name} (échec du nouveau)...`,
      );
      await this.docker.startContainer(serverId, c.id).catch(() => undefined);
      logs += `Ancien conteneur restauré : ${c.id.slice(0, 12)}\n`;
    }
    return logs;
  }

  /** Remove old container(s) once the new one is healthy and serving. */
  async removeContainers(
    serverId: string,
    containers: ServiceContainer[],
    deploymentId: string,
  ): Promise<string> {
    let logs = '';
    for (const c of containers) {
      this.emit(deploymentId, `Suppression de l'ancien conteneur ${c.name}...`);
      await this.docker
        .removeContainer(serverId, c.id, true)
        .catch(() => undefined);
      await this.prisma.container
        .updateMany({
          where: { dockerId: c.id },
          data: { status: ContainerStatus.EXITED },
        })
        .catch(() => undefined);
      logs += `Ancien conteneur supprimé : ${c.id.slice(0, 12)}\n`;
    }
    return logs;
  }
}
