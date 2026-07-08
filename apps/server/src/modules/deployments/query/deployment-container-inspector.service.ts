import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import {
  SshExecutorService,
  type SshConnection,
} from '../../../adapters/ssh/ssh-executor.service';
import type { IDockerRuntime } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DOCKER_RUNTIME } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DockerSshService } from '../../../adapters/container-runtime/docker-ssh.service';
import { ServersCryptoService } from '../../../adapters/ssh/servers-crypto.service';
import { ServerHostKeyService } from '../../../adapters/ssh/server-host-key.service';

/**
 * Handles container-level operations for deployments:
 * - Fetching container logs via SSH
 * - Resolving Docker image digests (TLS or SSH fallback)
 */
@Injectable()
export class DeploymentContainerInspectorService {
  private readonly logger = new Logger(
    DeploymentContainerInspectorService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly ssh: SshExecutorService,
    @Inject(DOCKER_RUNTIME)
    private readonly dockerRemoteService: IDockerRuntime,
    private readonly dockerSsh: DockerSshService,
    private readonly serverHostKeyService: ServerHostKeyService,
    private readonly serversCryptoService: ServersCryptoService,
  ) {}

  async getContainerLogs(deploymentId: string, tail = 300): Promise<string> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        service: { select: { id: true, name: true } },
      },
    });

    if (!deployment) throw new BadRequestException('Déploiement introuvable');

    const resolvedRefs = deployment.resolvedRefs as {
      serverId?: string;
    } | null;
    const serverId = resolvedRefs?.serverId;
    if (!serverId)
      throw new BadRequestException('Aucun serveur associé à ce déploiement');

    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server) throw new BadRequestException('Serveur introuvable');
    if (!server.sshKey)
      throw new BadRequestException('Aucune clé SSH configurée sur ce serveur');

    const pinnedHost = await this.serverHostKeyService.resolveForConnection(
      server,
      {
        allowTrustOnFirstUse: false,
      },
    );

    const decryptedKey = this.serversCryptoService.decrypt(server.sshKey);

    let conn: SshConnection | null = null;
    try {
      conn = await this.ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey: decryptedKey,
        expectedHostKey: pinnedHost.keyBase64,
        readyTimeoutMs: 10_000,
      });

      const containerName = deployment.serviceId
        ? `${deployment.serviceId}`
        : deploymentId;

      let container = await this.dockerSsh.findContainerByName(
        conn,
        containerName,
      );
      if (!container) {
        const allNames = await this.dockerSsh.listContainerNames(conn);
        container = allNames.split('\n')[0] ?? '';
      }

      if (!container) return '# Aucun conteneur Docker trouvé sur ce serveur';

      const logsResult = await this.dockerSsh.logsRaw(conn, container, tail);
      return logsResult.stdout || logsResult.stderr || '# Aucun log disponible';
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Erreur SSH: ${String(err)}`);
    } finally {
      if (conn) await conn.dispose();
    }
  }

  async resolveImageDigest(
    serverId: string,
    server: { host: string; port: number; username: string },
    privateKey: string,
    imageRef: string,
  ): Promise<string | null> {
    if (!imageRef || imageRef.startsWith('compose://')) return null;

    try {
      const info = await this.dockerRemoteService.inspectImage(
        serverId,
        imageRef,
      );
      if (info) {
        const digest = info.RepoDigests?.[0] ?? info.Id;
        if (digest && digest.startsWith('sha256:')) return digest;
      }
    } catch (error) {
      this.logger.warn(
        `DockerRemoteService.inspectImage failed for ${imageRef} on server ${serverId}, ` +
          `falling back to SSH: ${error instanceof Error ? error.message : 'erreur inconnue'}`,
      );
    }

    return this.safeResolveImageDigestViaSsh(server, privateKey, imageRef);
  }

  private async safeResolveImageDigestViaSsh(
    server: { host: string; port: number; username: string },
    privateKey: string,
    imageRef: string,
  ): Promise<string | null> {
    if (!imageRef || imageRef.startsWith('compose://')) return null;

    let conn: SshConnection | null = null;
    try {
      const pinnedHost = await this.serverHostKeyService.resolveForConnection(
        server,
        { allowTrustOnFirstUse: false },
      );
      conn = await this.ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey,
        expectedHostKey: pinnedHost.keyBase64,
        readyTimeoutMs: 5_000,
      });
      return await this.dockerSsh.imageDigest(conn, imageRef);
    } catch (error) {
      this.logger.warn(
        `Impossible de capturer le digest de ${imageRef} (rollback utilisera le tag mutable) : ${
          error instanceof Error ? error.message : 'erreur inconnue'
        }`,
      );
      return null;
    } finally {
      if (conn) await conn.dispose();
    }
  }
}
