import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  Server,
  ServerInstalledToolStatus,
  ServerStatus,
} from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { ServerAuditService } from './server-audit.service';
import { ServerVerificationService } from './server-verification.service';
import { ServersSshService } from './servers-ssh.service';

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
export class ServerDetectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ssh: ServersSshService,
    private readonly verification: ServerVerificationService,
    private readonly audit: ServerAuditService,
  ) {}

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

      await this.upsertCapability(server.id, 'os.name', osName || 'unknown');
      await this.upsertCapability(
        server.id,
        'os.version',
        osVersion || 'unknown',
      );
      await this.upsertCapability(server.id, 'os.id', osId || 'unknown');
      await this.upsertCapability(
        server.id,
        'os.architecture',
        architecture.stdout.trim() || 'unknown',
      );
      await this.upsertCapability(
        server.id,
        'python3.available',
        String(python.code === 0),
      );
      await this.upsertCapability(
        server.id,
        'systemd.available',
        String(systemd.code === 0),
      );
      await this.upsertCapability(
        server.id,
        'memory.kb',
        memory.stdout.trim() || 'unknown',
      );
      await this.upsertCapability(
        server.id,
        'disk.root.kb',
        disk.stdout.trim() || 'unknown',
      );

      const installed: Record<string, boolean> = {};
      for (const tool of DETECTION_TOOLS) {
        const result = await connection.target.execCommand(tool.command);
        const version = (result.stdout || result.stderr).trim().split('\n')[0];
        const isInstalled = result.code === 0;
        installed[tool.key] = isInstalled;
        await this.upsertCapability(
          server.id,
          tool.capabilityKey,
          String(isInstalled),
        );
        await this.upsertInstalledTool(
          server.id,
          tool,
          isInstalled,
          version || null,
        );
      }

      const updated = await this.prisma.server.update({
        where: { id: server.id },
        data: {
          status: ServerStatus.INFO_DETECTED,
          onboardingStep: 'INFO_DETECTED',
          lastDetectedAt: new Date(),
          hasDocker: Boolean(installed.docker),
          hasRunner: Boolean(installed.gitlab_runner),
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

  async listCapabilities(serverId: string) {
    return await this.prisma.serverCapability.findMany({
      where: { serverId },
      orderBy: [{ key: 'asc' }],
    });
  }

  async listInstalledTools(serverId: string) {
    return await this.prisma.serverInstalledTool.findMany({
      where: { serverId },
      orderBy: [{ displayName: 'asc' }],
    });
  }

  private async upsertCapability(
    serverId: string,
    key: string,
    value: string,
    source = 'ssh-detection',
  ): Promise<void> {
    await this.prisma.serverCapability.upsert({
      where: { serverId_key: { serverId, key } },
      update: { value, source, detectedAt: new Date() },
      create: { serverId, key, value, source },
    });
  }

  private async upsertInstalledTool(
    serverId: string,
    tool: DetectionTool,
    installed: boolean,
    version: string | null,
  ): Promise<void> {
    const status = installed
      ? ServerInstalledToolStatus.INSTALLED
      : ServerInstalledToolStatus.MISSING;
    const data: Prisma.ServerInstalledToolUncheckedCreateInput = {
      serverId,
      toolKey: tool.key,
      displayName: tool.displayName,
      version,
      installedBy: installed ? 'detected' : null,
      status,
      installedAt: installed ? new Date() : null,
    };

    await this.prisma.serverInstalledTool.upsert({
      where: { serverId_toolKey: { serverId, toolKey: tool.key } },
      update: {
        version,
        status,
        installedBy: installed ? 'detected' : null,
        installedAt: installed ? new Date() : null,
      },
      create: data,
    });
  }
}
