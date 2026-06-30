import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma, Server, ServerStatus } from '@prisma/client';
import { toJson } from '../../../../shared/utils/prisma-json.util';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { InstalledTool } from '../../../../adapters/server-capabilities/server-capabilities.types';
import { ServersAuditService } from './servers-audit.service';
import { ServerVerificationService } from './server-verification.service';
import { ServersConnectionService } from './servers-connection.service';
import {
  SERVER_EVENTS,
  type ServerSshValidatedPayload,
} from '../shared/server-events.constants';

type DetectionTool = {
  key: string;
  displayName: string;
  capabilityKey: string;
  command: string;
};

const DETECTION_TOOLS: DetectionTool[] = [
  {
    key: 'docker',
    displayName: 'Docker Engine',
    capabilityKey: 'docker.installed',
    command: 'docker --version',
  },
  {
    key: 'docker.compose_plugin',
    displayName: 'Docker Compose plugin',
    capabilityKey: 'docker.compose_plugin',
    command: 'docker compose version',
  },
  {
    key: 'nixpacks',
    displayName: 'Nixpacks',
    capabilityKey: 'nixpacks.installed',
    command: 'command -v nixpacks',
  },
  {
    key: 'nginx',
    displayName: 'Nginx',
    capabilityKey: 'nginx.installed',
    command: 'nginx -v',
  },
  {
    key: 'nodejs',
    displayName: 'Node.js',
    capabilityKey: 'nodejs.installed',
    command: 'node --version',
  },
  {
    key: 'postgres',
    displayName: 'PostgreSQL',
    capabilityKey: 'postgres.installed',
    command: 'psql --version',
  },
  {
    key: 'redis',
    displayName: 'Redis',
    capabilityKey: 'redis.installed',
    command: 'redis-server --version',
  },
  {
    key: 'gitlab_runner',
    displayName: 'GitLab Runner',
    capabilityKey: 'gitlab_runner.installed',
    command: 'gitlab-runner --version',
  },
  {
    key: 'ufw',
    displayName: 'UFW Firewall',
    capabilityKey: 'ufw.available',
    command: 'ufw --version',
  },
  {
    key: 'fail2ban',
    displayName: 'Fail2ban',
    capabilityKey: 'fail2ban.installed',
    command: 'fail2ban-server --version',
  },
  {
    key: 'certbot',
    displayName: 'Certbot',
    capabilityKey: 'certbot.installed',
    command: 'certbot --version',
  },
];

@Injectable()
export class ServersDetectionService {
  private readonly logger = new Logger(ServersDetectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ssh: ServersConnectionService,
    private readonly verification: ServerVerificationService,
    private readonly audit: ServersAuditService,
  ) {}

  @OnEvent(SERVER_EVENTS.SSH_VALIDATED)
  async onSshValidated(payload: ServerSshValidatedPayload): Promise<void> {
    this.logger.log(
      `[AUTO-DETECT] SSH validated for ${payload.serverId} — triggering automatic detection`,
    );
    try {
      const server = await this.prisma.server.findUnique({
        where: { id: payload.serverId },
      });
      if (!server) return;
      await this.detect(server);
    } catch (err) {
      this.logger.error(
        `[AUTO-DETECT] Detection failed for ${payload.serverId}: ${String(err)}`,
      );
    }
  }

  async detect(server: Server, actorId?: string): Promise<Server> {
    if (!server.isVerified) {
      throw new BadRequestException(
        'La validation SSH doit réussir avant la détection des informations serveur.',
      );
    }

    const connection = await this.ssh.openConnection(server);
    try {
      await this.verification.addLog(
        server.id,
        'Détection des informations système et outils installés...',
        undefined,
        'DETECT',
      );

      const osRelease = await connection.target.execCommand(
        'sh -lc \'if [ -r /etc/os-release ]; then . /etc/os-release; printf "%s|%s|%s" "${NAME:-unknown}" "${VERSION_ID:-unknown}" "${ID:-unknown}"; else printf "unknown|unknown|unknown"; fi\'',
      );
      const [osName, osVersion, osId] = osRelease.stdout.trim().split('|');
      const architecture = await connection.target.execCommand('uname -m');
      const systemd = await connection.target.execCommand(
        'command -v systemctl',
      );
      const python = await connection.target.execCommand('command -v python3');
      const memory = await connection.target.execCommand(
        "awk '/MemTotal/ {print $2}' /proc/meminfo",
      );
      const disk = await connection.target.execCommand(
        "df -Pk / | awk 'NR==2 {print $2}'",
      );

      // Accumulate everything into two JSON structures, then persist in ONE
      // update (no more N upserts across two join tables).
      const capabilities: Record<string, string> = {
        'os.name': osName || 'unknown',
        'os.version': osVersion || 'unknown',
        'os.id': osId || 'unknown',
        'os.architecture': architecture.stdout.trim() || 'unknown',
        'python3.available': String(python.code === 0),
        'systemd.available': String(systemd.code === 0),
        'memory.kb': memory.stdout.trim() || 'unknown',
        'disk.root.kb': disk.stdout.trim() || 'unknown',
      };

      const installed: Record<string, boolean> = {};
      const installedTools: InstalledTool[] = [];
      const toolResults = await Promise.all(
        DETECTION_TOOLS.map(async (tool) => {
          const result = await connection.target.execCommand(tool.command);
          const version = (result.stdout || result.stderr)
            .trim()
            .split('\n')[0];
          return {
            tool,
            isInstalled: result.code === 0,
            version: version || null,
          };
        }),
      );
      for (const { tool, isInstalled, version } of toolResults) {
        installed[tool.key] = isInstalled;
        capabilities[tool.capabilityKey] = String(isInstalled);
        installedTools.push(
          this.buildInstalledTool(tool, isInstalled, version),
        );
      }

      const updated = await this.prisma.server.update({
        where: { id: server.id },
        data: {
          status: ServerStatus.INFO_DETECTED,
          onboardingStep: 'INFO_DETECTED',
          lastDetectedAt: new Date(),
          // hasDocker/hasRunner are no longer stored — derived from capabilities
          // via serverHasDocker/serverHasRunner (single source of truth).
          capabilities: capabilities as Prisma.InputJsonValue,
          installedTools: toJson(installedTools),
        },
      });

      await this.audit.record(server.id, 'SERVER_DETECT', actorId, {
        toolsDetected: installed,
      });
      await this.verification.addLog(
        server.id,
        'Détection terminée.',
        undefined,
        'DETECT',
      );

      return updated;
    } finally {
      this.ssh.closeConnection(connection);
    }
  }

  /**
   * Capabilities as a list (back-compat shape: id/key/value/source/detectedAt),
   * rebuilt from the Server.capabilities JSON map.
   */
  async listCapabilities(serverId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { capabilities: true, lastDetectedAt: true },
    });
    const caps = (server?.capabilities as Record<string, string> | null) ?? {};
    const detectedAt = server?.lastDetectedAt ?? null;
    return Object.entries(caps)
      .map(([key, value]) => ({
        id: key,
        serverId,
        key,
        value,
        source: 'ssh-detection',
        detectedAt,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  /**
   * Installed tools as a list (back-compat shape), rebuilt from the
   * Server.installedTools JSON array.
   */
  async listInstalledTools(serverId: string) {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { installedTools: true },
    });
    const tools = (server?.installedTools as InstalledTool[] | null) ?? [];
    return tools
      .map((tool) => ({ id: `${serverId}:${tool.toolKey}`, serverId, ...tool }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  private buildInstalledTool(
    tool: DetectionTool,
    installed: boolean,
    version: string | null,
  ): InstalledTool {
    return {
      toolKey: tool.key,
      displayName: tool.displayName,
      version,
      installedBy: installed ? 'detected' : null,
      status: installed ? 'INSTALLED' : 'MISSING',
      installedAt: installed ? new Date().toISOString() : null,
    };
  }
}
