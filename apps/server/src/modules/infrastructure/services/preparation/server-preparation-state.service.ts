import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ServerPreparationStatus,
  ServerPreparationTaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../core/database/prisma.service';
import { ServerPreparationGateway } from '../../gateways/server-preparation.gateway';

export const ACTIVE_PREPARATION_STATUSES: ServerPreparationStatus[] = [
  ServerPreparationStatus.QUEUED,
  ServerPreparationStatus.RESOLVING_OPTIONS,
  ServerPreparationStatus.WAITING_FOR_LOCK,
  ServerPreparationStatus.RUNNING,
];

export const ALLOWED_PREPARATION_TRANSITIONS: Record<
  ServerPreparationStatus,
  ServerPreparationStatus[]
> = {
  [ServerPreparationStatus.QUEUED]: [
    ServerPreparationStatus.RESOLVING_OPTIONS,
    ServerPreparationStatus.CANCELED,
  ],
  [ServerPreparationStatus.RESOLVING_OPTIONS]: [
    ServerPreparationStatus.WAITING_FOR_LOCK,
    ServerPreparationStatus.FAILED,
    ServerPreparationStatus.CANCELED,
  ],
  [ServerPreparationStatus.WAITING_FOR_LOCK]: [
    ServerPreparationStatus.RUNNING,
    ServerPreparationStatus.FAILED,
    ServerPreparationStatus.CANCELED,
  ],
  [ServerPreparationStatus.RUNNING]: [
    ServerPreparationStatus.SUCCEEDED,
    ServerPreparationStatus.PARTIAL,
    ServerPreparationStatus.FAILED,
    ServerPreparationStatus.TIMEOUT,
    ServerPreparationStatus.CANCELED,
  ],
  [ServerPreparationStatus.SUCCEEDED]: [],
  [ServerPreparationStatus.PARTIAL]: [],
  [ServerPreparationStatus.FAILED]: [],
  [ServerPreparationStatus.TIMEOUT]: [],
  [ServerPreparationStatus.CANCELED]: [],
};

@Injectable()
export class ServerPreparationStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ServerPreparationGateway,
  ) {}

  async transitionPreparation(
    preparationId: string,
    status: ServerPreparationStatus,
    extra?: Prisma.ServerPreparationUpdateInput,
  ): Promise<void> {
    const current = await this.prisma.serverPreparation.findUnique({
      where: { id: preparationId },
      select: { status: true },
    });
    if (!current) {
      throw new NotFoundException('Préparation serveur introuvable');
    }

    if (
      current.status !== status &&
      !ALLOWED_PREPARATION_TRANSITIONS[current.status].includes(status)
    ) {
      throw new BadRequestException(
        `Transition invalide de ${current.status} vers ${status}`,
      );
    }

    await this.prisma.serverPreparation.update({
      where: { id: preparationId },
      data: {
        status,
        ...(status === ServerPreparationStatus.RUNNING
          ? { startedAt: new Date() }
          : {}),
        ...extra,
      },
    });
    this.gateway.emitStatus({ preparationId, status });
  }

  async markAllRemainingTasks(
    preparationId: string,
    status: ServerPreparationTaskStatus,
  ): Promise<void> {
    await this.prisma.serverPreparationTask.updateMany({
      where: {
        preparationId,
        status: {
          in: [
            ServerPreparationTaskStatus.PENDING,
            ServerPreparationTaskStatus.RUNNING,
          ],
        },
      },
      data: { status, finishedAt: new Date() },
    });
  }

  async markFailedRunningTasks(
    preparationId: string,
    timeout: boolean,
  ): Promise<void> {
    await this.prisma.serverPreparationTask.updateMany({
      where: {
        preparationId,
        status: ServerPreparationTaskStatus.RUNNING,
      },
      data: {
        status: timeout
          ? ServerPreparationTaskStatus.TIMEOUT
          : ServerPreparationTaskStatus.FAILED,
        finishedAt: new Date(),
      },
    });
    await this.prisma.serverPreparationTask.updateMany({
      where: {
        preparationId,
        status: ServerPreparationTaskStatus.PENDING,
      },
      data: { status: ServerPreparationTaskStatus.SKIPPED },
    });
  }
}
