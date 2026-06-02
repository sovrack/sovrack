import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NodeSSH } from 'node-ssh';
import { PrismaService } from '../../../core/database/prisma.service';
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
export class ContainerMonitoringService {
  private readonly logger = new Logger(ContainerMonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly serversCryptoService: ServersCryptoService,
    private readonly serverHostKeyService: ServerHostKeyService,
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
        environment: { include: { server: true } },
      },
    });

    if (!deployment) throw new NotFoundException('Déploiement non trouvé');

    const server = deployment.environment.server;
    const decryptedKey = this.serversCryptoService.decrypt(server.sshKey);

    const containerName = this.slugify(
      deployment.service
        ? `${deployment.project.name}-${deployment.service.name}`
        : deployment.project.name,
    );

    const ssh = new NodeSSH();
    try {
      const pinnedHost = await this.serverHostKeyService.resolveForConnection(
        server,
        { allowTrustOnFirstUse: false },
      );

      await ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey: decryptedKey,
        readyTimeout: 10_000,
        hostVerifier: this.serverHostKeyService.hostVerifier(pinnedHost.keyBase64),
      });

      const [statsResult, logsResult, psResult] = await Promise.all([
        ssh.execCommand(
          `docker stats --no-stream --format "{{.ID}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}" ${containerName} 2>/dev/null || echo "NOT_FOUND"`,
        ),
        ssh.execCommand(
          `docker logs --tail ${String(tailLines)} --timestamps ${containerName} 2>&1 || echo "CONTAINER_NOT_FOUND"`,
        ),
        ssh.execCommand(
          `docker ps --filter "name=${containerName}" --format "{{.Status}}" 2>/dev/null`,
        ),
      ]);

      const statsLine = statsResult.stdout.trim();
      const logsOutput = logsResult.stdout.trim();
      const psOutput = psResult.stdout.trim();

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
      ssh.dispose();
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
    const ssh = new NodeSSH();

    try {
      const pinnedHost = await this.serverHostKeyService.resolveForConnection(
        server,
        { allowTrustOnFirstUse: false },
      );

      await ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey: decryptedKey,
        readyTimeout: 10_000,
        hostVerifier: this.serverHostKeyService.hostVerifier(pinnedHost.keyBase64),
      });

      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });

      const projectSlug = this.slugify(project?.name ?? projectId);

      const result = await ssh.execCommand(
        `docker stats --no-stream --format "{{.ID}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}" 2>/dev/null | grep "^[^|]*|${projectSlug}" || true`,
      );

      const lines = result.stdout.trim().split('\n').filter(Boolean);

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
      ssh.dispose();
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
