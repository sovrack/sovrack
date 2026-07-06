import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ServerRunStatus, ServerRunStepStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/database/prisma.service';
import { ServerSetupGateway } from '../../gateways/server-setup.gateway';

// SETUP runs live in the unified ServerRun table (kind=PREPARATION).
// These statuses are exactly the setup lifecycle states (ServerRunStatus
// is a superset shared with AUTOMATION runs, which never reach this service).
export const ACTIVE_SETUP_STATUSES: ServerRunStatus[] = [
  ServerRunStatus.QUEUED,
  ServerRunStatus.RESOLVING_OPTIONS,
  ServerRunStatus.WAITING_FOR_LOCK,
  ServerRunStatus.RUNNING,
];

export const ALLOWED_SETUP_TRANSITIONS: Partial<
  Record<ServerRunStatus, ServerRunStatus[]>
> = {
  [ServerRunStatus.QUEUED]: [
    ServerRunStatus.RESOLVING_OPTIONS,
    ServerRunStatus.CANCELED,
  ],
  [ServerRunStatus.RESOLVING_OPTIONS]: [
    ServerRunStatus.WAITING_FOR_LOCK,
    ServerRunStatus.FAILED,
    ServerRunStatus.CANCELED,
  ],
  [ServerRunStatus.WAITING_FOR_LOCK]: [
    ServerRunStatus.RUNNING,
    ServerRunStatus.FAILED,
    ServerRunStatus.CANCELED,
  ],
  [ServerRunStatus.RUNNING]: [
    ServerRunStatus.SUCCEEDED,
    ServerRunStatus.PARTIAL,
    ServerRunStatus.FAILED,
    ServerRunStatus.TIMEOUT,
    ServerRunStatus.CANCELED,
  ],
  [ServerRunStatus.SUCCEEDED]: [],
  [ServerRunStatus.PARTIAL]: [],
  [ServerRunStatus.FAILED]: [],
  [ServerRunStatus.TIMEOUT]: [],
  [ServerRunStatus.CANCELED]: [],
};

@Injectable()
export class ServerSetupStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ServerSetupGateway,
  ) {}

  async transitionSetup(
    setupId: string,
    status: ServerRunStatus,
    extra?: Prisma.ServerRunUpdateInput,
  ): Promise<void> {
    const current = await this.prisma.serverRun.findUnique({
      where: { id: setupId },
      select: { status: true },
    });
    if (!current) {
      throw new NotFoundException('Setup serveur introuvable');
    }

    if (
      current.status !== status &&
      !(ALLOWED_SETUP_TRANSITIONS[current.status] ?? []).includes(status)
    ) {
      throw new BadRequestException(
        `Transition invalide de ${current.status} vers ${status}`,
      );
    }

    await this.prisma.serverRun.update({
      where: { id: setupId },
      data: {
        status,
        ...(status === ServerRunStatus.RUNNING
          ? { startedAt: new Date() }
          : {}),
        ...extra,
      },
    });
    this.gateway.emitStatus({ setupId: setupId, status });
  }

  async markAllRemainingTasks(
    setupId: string,
    status: ServerRunStepStatus,
  ): Promise<void> {
    await this.prisma.serverRunStep.updateMany({
      where: {
        runId: setupId,
        status: {
          in: [ServerRunStepStatus.PENDING, ServerRunStepStatus.RUNNING],
        },
      },
      data: { status, finishedAt: new Date() },
    });
  }

  async markFailedRunningTasks(
    setupId: string,
    timeout: boolean,
  ): Promise<void> {
    await this.prisma.serverRunStep.updateMany({
      where: {
        runId: setupId,
        status: ServerRunStepStatus.RUNNING,
      },
      data: {
        status: timeout
          ? ServerRunStepStatus.TIMEOUT
          : ServerRunStepStatus.FAILED,
        finishedAt: new Date(),
      },
    });
    await this.prisma.serverRunStep.updateMany({
      where: {
        runId: setupId,
        status: ServerRunStepStatus.PENDING,
      },
      data: { status: ServerRunStepStatus.SKIPPED },
    });
  }
}
