import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { Server, ServerLogLevel, ServerStatus } from '@prisma/client';
import {
  SERVER_EVENTS,
  type ServerSshValidatedPayload,
} from '../shared/server-events.constants';

type ValidationResultInput = {
  sshReachable: boolean;
  authSucceeded: boolean;
  sudoAvailable: boolean;
  fingerprint?: string | null;
  osName?: string | null;
  osVersion?: string | null;
  architecture?: string | null;
  pythonAvailable: boolean;
  validationMessage?: string | null;
};

@Injectable()
export class ServersVerificationService {
  private readonly logger = new Logger(ServersVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async startVerification(serverId: string): Promise<Server> {
    this.logger.log(`[SSH] Starting SSH validation for server ${serverId}`);

    const updated = await this.prisma.server.update({
      where: { id: serverId },
      data: { status: ServerStatus.SSH_PENDING, verificationError: null },
    });

    await this.addLog(
      serverId,
      'Validation SSH initiée',
      ServerLogLevel.INFO,
      'SSH',
    );
    return updated;
  }

  async markSshValidated(
    serverId: string,
    result: ValidationResultInput,
  ): Promise<Server> {
    const fullyValidated =
      result.sshReachable && result.authSucceeded && result.sudoAvailable;

    this.logger.log(
      `[SSH] Server ${serverId} validated (sudo: ${String(result.sudoAvailable)}, python: ${String(result.pythonAvailable)})`,
    );

    await this.prisma.serverValidationResult.create({
      data: {
        serverId,
        sshReachable: result.sshReachable,
        authSucceeded: result.authSucceeded,
        sudoAvailable: result.sudoAvailable,
        fingerprint: result.fingerprint,
        osName: result.osName,
        osVersion: result.osVersion,
        architecture: result.architecture,
        pythonAvailable: result.pythonAvailable,
        validationMessage: result.validationMessage,
        validatedAt: new Date(),
      },
    });

    const updated = await this.prisma.server.update({
      where: { id: serverId },
      data: {
        status: fullyValidated
          ? ServerStatus.SSH_VALIDATED
          : ServerStatus.VALIDATION_FAILED,
        isVerified: fullyValidated,
        onboardingStep: fullyValidated ? 'SSH_VALIDATED' : 'KEY_INSTALLED',
        lastVerifiedAt: new Date(),
        verificationError: fullyValidated
          ? null
          : 'Validation SSH incomplète: sudo sans mot de passe indisponible.',
      },
    });

    await this.addLog(
      serverId,
      fullyValidated
        ? `Validation SSH réussie — sudo: ${result.sudoAvailable ? 'OK' : 'KO'}, python3: ${result.pythonAvailable ? 'OK' : 'KO'}`
        : `Validation SSH partielle — sudo: ${result.sudoAvailable ? 'OK' : 'KO'}, python3: ${result.pythonAvailable ? 'OK' : 'KO'}`,
      result.sudoAvailable ? ServerLogLevel.INFO : ServerLogLevel.WARNING,
      'SSH',
    );

    if (fullyValidated) {
      const payload: ServerSshValidatedPayload = { serverId };
      this.eventEmitter.emit(SERVER_EVENTS.SSH_VALIDATED, payload);
    }

    return updated;
  }

  async markFailed(serverId: string, error: Error | string): Promise<Server> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error(`[SSH] Server ${serverId} failed: ${errorMessage}`);

    await this.prisma.serverValidationResult.create({
      data: {
        serverId,
        sshReachable: false,
        authSucceeded: false,
        sudoAvailable: false,
        pythonAvailable: false,
        validationMessage: errorMessage,
        validatedAt: new Date(),
      },
    });

    const updated = await this.prisma.server.update({
      where: { id: serverId },
      data: {
        status: ServerStatus.VALIDATION_FAILED,
        isVerified: false,
        onboardingStep: 'KEY_INSTALLED',
        verificationError: errorMessage,
      },
    });

    await this.addLog(
      serverId,
      `Validation SSH échouée: ${errorMessage}`,
      ServerLogLevel.ERROR,
      'SSH',
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

  async listValidationResults(serverId: string) {
    return await this.prisma.serverValidationResult.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async latestValidationResult(serverId: string) {
    return await this.prisma.serverValidationResult.findFirst({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
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
    this.logger.log(`[SSH] Resetting status for server ${serverId}`);
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
