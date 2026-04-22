import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Server, ServerStatus, ServerLogLevel } from '@prisma/client';

@Injectable()
export class ServerVerificationService {
  private readonly logger = new Logger(ServerVerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async startVerification(serverId: string): Promise<Server> {
    this.logger.log(`[VERIFY] Starting verification for server ${serverId}`);

    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    const updated = await this.prisma.server.update({
      where: { id: serverId },
      data: { status: ServerStatus.VERIFYING, verificationError: null },
    });

    await this.addLog(
      serverId,
      'Vérification initiée',
      ServerLogLevel.INFO,
      'VERIFY',
    );
    return updated;
  }

  async markVerified(
    serverId: string,
    hasDocker: boolean,
    hasAnsible: boolean,
    hasRunner: boolean,
  ): Promise<Server> {
    this.logger.log(
      `[VERIFY] ✓ Server ${serverId} verified (Docker: ${hasDocker}, Ansible: ${hasAnsible}, Runner: ${hasRunner})`,
    );

    const updated = await this.prisma.server.update({
      where: { id: serverId },
      data: {
        status: ServerStatus.VERIFIED,
        isVerified: true,
        hasDocker,
        hasAnsible,
        hasRunner,
        onboardingStep:
          hasDocker && hasAnsible && hasRunner ? 'READY' : 'VALIDATED',
        lastVerifiedAt: new Date(),
        verificationError: null,
      },
    });

    const tools = [
      hasDocker ? 'Docker' : null,
      hasAnsible ? 'Ansible' : null,
      hasRunner ? 'GitLab Runner' : null,
    ]
      .filter(Boolean)
      .join(', ');

    await this.addLog(
      serverId,
      `✓ Vérification réussie — Outils trouvés: ${tools || 'aucun'}`,
      ServerLogLevel.INFO,
      'VERIFY',
    );

    return updated;
  }

  async markFailed(serverId: string, error: Error | string): Promise<Server> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error(`[VERIFY] ✗ Server ${serverId} failed: ${errorMessage}`);

    const updated = await this.prisma.server.update({
      where: { id: serverId },
      data: {
        status: ServerStatus.FAILED,
        isVerified: false,
        hasDocker: false,
        hasAnsible: false,
        hasRunner: false,
        // Regress to KEY_INSTALLED: key was installed (verifyServer blocks PENDING servers),
        // but SSH connection failed so the server is no longer verified.
        onboardingStep: 'KEY_INSTALLED',
        verificationError: errorMessage,
      },
    });

    await this.addLog(
      serverId,
      `✗ Vérification échouée: ${errorMessage}`,
      ServerLogLevel.ERROR,
      'VERIFY',
    );

    return updated;
  }

  async addLog(
    serverId: string,
    message: string,
    level: ServerLogLevel = ServerLogLevel.INFO,
    context?: string,
  ): Promise<void> {
    try {
      await this.prisma.serverLog.create({
        data: { serverId, message, level, context },
      });

      const prefix = `[${context ?? 'SERVER'}]`;
      if (level === ServerLogLevel.ERROR) {
        this.logger.error(`${prefix} ${message}`);
      } else if (level === ServerLogLevel.WARNING) {
        this.logger.warn(`${prefix} ${message}`);
      } else {
        this.logger.log(`${prefix} ${message}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to create log entry: ${String(err)}`);
    }
  }

  async getRecentLogs(serverId: string, limit = 50) {
    return await this.prisma.serverLog.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async cleanupOldLogs(): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.serverLog.deleteMany({
      where: { createdAt: { lt: thirtyDaysAgo } },
    });
    this.logger.log(`[CLEANUP] Deleted ${result.count} old logs`);
    return result.count;
  }

  async resetStatus(serverId: string): Promise<Server> {
    this.logger.log(`[VERIFY] Resetting status for server ${serverId}`);
    return await this.prisma.server.update({
      where: { id: serverId },
      data: {
        status: ServerStatus.NEW,
        verificationError: null,
        isVerified: false,
      },
    });
  }
}
