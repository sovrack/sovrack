import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import {
  SshExecutorService,
  type SshConnection,
} from '../../../core/ssh/ssh-executor.service';
import { DockerSshService } from '../../../core/container-runtime/docker-ssh.service';
import {
  ServerHostKeyService,
  ServersCryptoService,
} from '../../servers/services';

export type ContainerStats = {
  containerId: string;
  name: string;
  cpuPercent: string;
  memUsage: string;
  memPercent: string;
  netIO: string;
  blockIO: string;
  pids: string;
  status: 'running' | 'stopped' | 'not_found' | 'unknown';
};

export type ContainerInfo = {
  stats: ContainerStats | null;
  logs: string;
  status: 'running' | 'stopped' | 'not_found' | 'unknown';
};

@Injectable()
export class ContainerStatsService {
  private readonly logger = new Logger(ContainerStatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly serversCryptoService: ServersCryptoService,
    private readonly serverHostKeyService: ServerHostKeyService,
    private readonly ssh: SshExecutorService,
    private readonly dockerSsh: DockerSshService,
  ) {}

  async getContainerInfo(
    deploymentId: string,
    tailLines = 200,
  ): Promise<ContainerInfo> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        project: true,
        service: true,
        environment: true,
      },
    });

    if (!deployment) throw new NotFoundException('Déploiement non trouvé');

    const container = await this.prisma.container.findFirst({
      where: { deploymentId },
      include: { server: true },
    });
    if (!container?.server) throw new NotFoundException('Container/serveur non trouvé');
    const server = container.server;
    const decryptedKey = this.serversCryptoService.decrypt(server.sshKey);

    const containerName = this.slugify(
      deployment.service
        ? `${deployment.project.name}-${deployment.service.name}`
        : deployment.project.name,
    );

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
        privateKey: decryptedKey,
        expectedHostKey: pinnedHost.keyBase64,
        readyTimeoutMs: 10_000,
      });

      const [statsLine, logsOutput, psOutput] = await Promise.all([
        this.dockerSsh.containerStats(conn, containerName),
        this.dockerSsh.containerLogs(conn, containerName, tailLines),
        this.dockerSsh.containerStatus(conn, containerName),
      ]);

      const containerRunning = psOutput.toLowerCase().startsWith('up');
      const containerExists =
        !logsOutput.includes('CONTAINER_NOT_FOUND') &&
        !statsLine.includes('NOT_FOUND');

      const status = containerRunning
        ? 'running'
        : containerExists
          ? 'stopped'
          : 'not_found';

      let parsedStats: ContainerStats | null = null;

      if (statsLine && !statsLine.includes('NOT_FOUND')) {
        const parts = statsLine.split('|');
        if (parts.length >= 8) {
          parsedStats = {
            containerId: parts[0] ?? '',
            name: parts[1] ?? containerName,
            cpuPercent: parts[2] ?? '0%',
            memUsage: parts[3] ?? '0B / 0B',
            memPercent: parts[4] ?? '0%',
            netIO: parts[5] ?? '0B / 0B',
            blockIO: parts[6] ?? '0B / 0B',
            pids: parts[7] ?? '0',
            status,
          };
        }
      }

      return {
        stats: parsedStats,
        logs: logsOutput,
        status,
      };
    } catch (error) {
      this.logger.warn(
        `Impossible de récupérer les infos du container pour déploiement ${deploymentId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { stats: null, logs: '', status: 'unknown' };
    } finally {
      if (conn) await conn.dispose();
    }
  }

  async listProjectContainers(
    projectId: string,
    serverId: string,
  ): Promise<ContainerStats[]> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!server) throw new NotFoundException('Serveur non trouvé');

    const decryptedKey = this.serversCryptoService.decrypt(server.sshKey);
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
        privateKey: decryptedKey,
        expectedHostKey: pinnedHost.keyBase64,
        readyTimeoutMs: 10_000,
      });

      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });

      const projectSlug = this.slugify(project?.name ?? projectId);

      const statsOutput = await this.dockerSsh.projectStats(conn, projectSlug);
      const lines = statsOutput.split('\n').filter(Boolean);

      return lines.map((line) => {
        const parts = line.split('|');
        return {
          containerId: parts[0] ?? '',
          name: parts[1] ?? '',
          cpuPercent: parts[2] ?? '0%',
          memUsage: parts[3] ?? '0B / 0B',
          memPercent: parts[4] ?? '0%',
          netIO: parts[5] ?? '0B / 0B',
          blockIO: parts[6] ?? '0B / 0B',
          pids: parts[7] ?? '0',
          status: 'running',
        };
      });
    } finally {
      if (conn) await conn.dispose();
    }
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'app';
  }
}
