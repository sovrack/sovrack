import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import {
  SshExecutorService,
  type SshConnection,
} from '../../../core/ssh/ssh-executor.service';
import { DockerApiService } from '../../../core/docker/docker-api.service';
import { DockerSshService } from '../../../core/docker/docker-ssh.service';
import {
  ServerHostKeyService,
  ServersCryptoService,
} from '../../servers/services';

/**
 * Handles container-level operations for deployments:
 * - Fetching container logs via SSH
 * - Resolving Docker image digests (TLS or SSH fallback)
 */
@Injectable()
export class DeploymentContainerInspectorService {
  private readonly logger = new Logger(DeploymentContainerInspectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ssh: SshExecutorService,
    private readonly dockerRemoteService: DockerApiService,
    private readonly dockerSsh: DockerSshService,
    private readonly serverHostKeyService: ServerHostKeyService,
    private readonly serversCryptoService: ServersCryptoService,
  ) {}

  async getContainerLogs(deploymentId: string, tail = 300): Promise<string> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        environment: {
          include: {
            server: true,
            serviceTargets: { include: { server: true } },
          },
        },
        service: true,
      },
    });

    if (!deployment) throw new BadRequestException('Déploiement introuvable');

    const serviceTarget = deployment.serviceId
      ? deployment.environment.serviceTargets.find(
          (t) => t.serviceId === deployment.serviceId,
        )
      : null;
    const server = serviceTarget?.server ?? deployment.environment.server;

    if (!server) throw new BadRequestException('Aucun serveur associé à ce déploiement');
    if (!server.sshKey) throw new BadRequestException('Aucune clé SSH configurée sur ce serveur');

    const pinnedHost = await this.serverHostKeyService.resolveForConnection(server, {
      allowTrustOnFirstUse: false,
    });

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

      let container = await this.dockerSsh.findContainerByName(conn, containerName);
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
      const info = await this.dockerRemoteService.inspectImage(serverId, imageRef);
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
