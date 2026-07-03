import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  ServerJob,
  ServerJobStatus,
  ServerJobType,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import {
  PaginationDto,
  paginate,
} from '../../../../shared/http/pagination.dto';
import { ServersConnectionService } from './servers-connection.service';
import { InstallToolsDto } from '../dto/install-tools.dto';
import { StartServerPreparationDto } from '../dto/start-server-preparation.dto';
import {
  ServerExecutionOptions,
  ServerJobPublic,
  ServerJobsListResult,
} from '../shared/servers.types';

@Injectable()
export class ServersJobsService implements OnModuleInit {
  private readonly logger = new Logger(ServersJobsService.name);
  private readonly defaultJobTimeoutMs: number;
  private readonly defaultJobMaxAttempts = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ssh: ServersConnectionService,
    private readonly configService: ConfigService,
  ) {
    this.defaultJobTimeoutMs = this.resolveDefaultJobTimeoutMs();
  }

  async onModuleInit(): Promise<void> {
    const ghostJobs = await this.prisma.serverJob.findMany({
      where: {
        status: { in: [ServerJobStatus.RUNNING, ServerJobStatus.PENDING] },
      },
      select: { id: true, serverId: true },
    });

    if (ghostJobs.length === 0) return;

    this.logger.warn(
      `[startup] Found ${ghostJobs.length} ghost job(s) in RUNNING/PENDING — marking FAILED`,
    );

    await this.prisma.serverJob.updateMany({
      where: { id: { in: ghostJobs.map((j) => j.id) } },
      data: {
        status: ServerJobStatus.FAILED,
        error:
          "Job interrompu lors du redémarrage du backend. Relancez l'opération.",
        finishedAt: new Date(),
      },
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupStaleJobs(): Promise<void> {
    const runningCutoff = new Date(Date.now() - 2 * 60 * 60_000); // 2 hours
    const pendingCutoff = new Date(Date.now() - 10 * 60_000); // 10 minutes
    const stale = await this.prisma.serverJob.findMany({
      where: {
        OR: [
          { status: ServerJobStatus.RUNNING, startedAt: { lt: runningCutoff } },
          // PENDING jobs that never transitioned to RUNNING = zombies left by a
          // crash between createJob() and executeJobWithRetry(). With the partial
          // unique index they keep blocking new jobs until cleaned up here.
          { status: ServerJobStatus.PENDING, createdAt: { lt: pendingCutoff } },
        ],
      },
      select: { id: true },
    });

    if (stale.length === 0) return;

    this.logger.warn(
      `[cron] Found ${stale.length} stale job(s) (RUNNING>2h or PENDING>10min) — marking FAILED`,
    );

    await this.prisma.serverJob.updateMany({
      where: { id: { in: stale.map((j) => j.id) } },
      data: {
        status: ServerJobStatus.FAILED,
        error:
          'Job bloqué trop longtemps — nettoyage automatique toutes les 5 minutes.',
        finishedAt: new Date(),
      },
    });
  }

  /**
   * Lock-before-create: fail fast (HTTP 409) when the server already has an
   * in-progress job, instead of creating a second job that would later be marked
   * BLOCKED by {@link assertJobLock}. This prevents the "ghost/blocked job"
   * accumulation when a user triggers two operations in quick succession.
   *
   * Only RUNNING/PENDING count as in-progress. BLOCKED is terminal (it carries a
   * finishedAt) — a job that lost the lock race must NOT keep the server locked
   * forever, since nothing ever transitions a BLOCKED job out of that state.
   */
  async assertNoActiveJob(serverId: string): Promise<void> {
    const active = await this.prisma.serverJob.findFirst({
      where: {
        serverId,
        status: {
          in: [ServerJobStatus.RUNNING, ServerJobStatus.PENDING],
        },
      },
      select: { type: true },
    });

    if (active) {
      throw new ConflictException(
        `Une opération (${active.type}) est déjà en cours sur ce serveur. ` +
          "Attendez sa fin ou annulez-la avant d'en lancer une nouvelle.",
      );
    }
  }

  async forceFailJob(
    serverId: string,
    jobId: string,
  ): Promise<ServerJobPublic> {
    const job = await this.prisma.serverJob.findFirst({
      where: { id: jobId, serverId },
    });

    if (!job) {
      throw new NotFoundException('Job serveur non trouvé');
    }

    if (
      job.status === ServerJobStatus.SUCCESS ||
      job.status === ServerJobStatus.FAILED
    ) {
      throw new BadRequestException(
        'Ce job est déjà terminé et ne peut pas être annulé.',
      );
    }

    const updated = await this.prisma.serverJob.update({
      where: { id: jobId },
      data: {
        status: ServerJobStatus.FAILED,
        error: 'Job annulé manuellement par un administrateur.',
        finishedAt: new Date(),
      },
    });

    return this.toPublicJob(updated);
  }

  async listJobs(
    id: string,
    pagination?: PaginationDto,
  ): Promise<ServerJobsListResult> {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException('Serveur non trouvé');
    }

    if (!pagination?.page || !pagination?.limit) {
      const jobs = await this.prisma.serverJob.findMany({
        where: { serverId: id },
        orderBy: { createdAt: 'desc' },
      });
      return jobs.map((job) => this.toPublicJob(job));
    }

    const page = pagination.page;
    const limit = pagination.limit;
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      this.prisma.serverJob.findMany({
        where: { serverId: id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.serverJob.count({
        where: { serverId: id },
      }),
    ]);

    return paginate(
      jobs.map((job) => this.toPublicJob(job)),
      total,
      page,
      limit,
    );
  }

  async retryJob<T>(
    id: string,
    jobId: string,
    handlers: {
      verify: () => Promise<T>;
      install: (payload?: InstallToolsDto) => Promise<T>;
      prepare: (payload?: StartServerPreparationDto) => Promise<T>;
    },
  ): Promise<T> {
    const job = await this.prisma.serverJob.findFirst({
      where: {
        id: jobId,
        serverId: id,
      },
    });

    if (!job) {
      throw new NotFoundException('Job serveur non trouvé');
    }

    if (job.type === ServerJobType.VERIFY) {
      return await handlers.verify();
    }

    if (job.type === ServerJobType.INSTALL_TOOLS) {
      const payload =
        (job.payload as InstallToolsDto | null | undefined) ?? undefined;
      return await handlers.install(payload);
    }

    if (job.type === ServerJobType.PREPARE_SERVER) {
      const payload =
        (job.payload as { selectedOptions?: StartServerPreparationDto } | null)
          ?.selectedOptions ?? undefined;
      return await handlers.prepare(payload);
    }

    throw new BadRequestException(
      'Ce type de job nécessite des paramètres non rejouables',
    );
  }

  async executeJobWithRetry<T>(
    job: ServerJob,
    task: (options: ServerExecutionOptions) => Promise<T>,
    toErrorMessage: (error: unknown) => string,
  ): Promise<T> {
    await this.assertJobLock(job);

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= job.maxAttempts; attempt += 1) {
      await this.prisma.serverJob.update({
        where: { id: job.id },
        data: {
          status: ServerJobStatus.RUNNING,
          attempts: attempt,
          ...(attempt === 1 && { startedAt: new Date() }),
          error: null,
        },
      });

      try {
        const abortController = new AbortController();
        const result = await this.ssh.withTimeout(
          () =>
            task({
              signal: abortController.signal,
              timeoutMs: job.timeoutMs,
            }),
          job.timeoutMs,
          () => abortController.abort(),
        );

        await this.prisma.serverJob.update({
          where: { id: job.id },
          data: {
            status: ServerJobStatus.SUCCESS,
            output: 'Exécution terminée avec succès',
            finishedAt: new Date(),
          },
        });

        return result;
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === job.maxAttempts;

        if (!isLastAttempt) {
          continue;
        }

        const message =
          error instanceof Error ? error.message : 'Exécution distante échouée';

        await this.prisma.serverJob.update({
          where: { id: job.id },
          data: {
            status: message.startsWith('JOB_TIMEOUT_')
              ? ServerJobStatus.TIMEOUT
              : ServerJobStatus.FAILED,
            error: toErrorMessage(error),
            finishedAt: new Date(),
          },
        });
      }
    }

    throw new BadRequestException(toErrorMessage(lastError));
  }

  async assertJobLock(job: ServerJob): Promise<void> {
    const runningCount = await this.prisma.serverJob.count({
      where: {
        serverId: job.serverId,
        status: ServerJobStatus.RUNNING,
        id: {
          not: job.id,
        },
      },
    });

    if (runningCount === 0) {
      return;
    }

    await this.prisma.serverJob.update({
      where: { id: job.id },
      data: {
        status: ServerJobStatus.BLOCKED,
        error: 'Un autre job est déjà en cours sur ce serveur',
        finishedAt: new Date(),
      },
    });

    throw new BadRequestException(
      'Un autre job est déjà en cours sur ce serveur, réessayez plus tard.',
    );
  }

  async createJob(
    serverId: string,
    type: ServerJobType,
    payload?: object,
  ): Promise<ServerJob> {
    return await this.prisma.serverJob.create({
      data: {
        serverId,
        type,
        maxAttempts: this.defaultJobMaxAttempts,
        timeoutMs: this.defaultJobTimeoutMs,
        ...(payload && { payload: payload as Prisma.InputJsonValue }),
      },
    });
  }

  /**
   * Atomic "lock-before-create": the active-job check and the INSERT happen in a
   * single transaction guarded by a per-server advisory lock (same lock key as
   * {@link InfraPreparationService} preparation guard, so verify/register/prepare
   * starts mutually exclude). The partial unique index `unique_active_server_job`
   * (status IN RUNNING/PENDING) is the hard DB backstop: even if two paths race
   * past the in-memory check, the second INSERT raises P2002 and is surfaced as a
   * 409 ConflictException instead of silently creating a second job that would be
   * marked BLOCKED forever.
   *
   * Replaces the old non-atomic `assertNoActiveJob()` + `createJob()` sequence.
   */
  async createJobAtomic(
    serverId: string,
    type: ServerJobType,
    payload?: object,
  ): Promise<ServerJob> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${serverId}))`;

        const active = await tx.serverJob.findFirst({
          where: {
            serverId,
            status: {
              in: [ServerJobStatus.RUNNING, ServerJobStatus.PENDING],
            },
          },
          select: { type: true },
        });

        if (active) {
          throw new ConflictException(
            `Une opération (${active.type}) est déjà en cours sur ce serveur. ` +
              "Attendez sa fin ou annulez-la avant d'en lancer une nouvelle.",
          );
        }

        return await tx.serverJob.create({
          data: {
            serverId,
            type,
            maxAttempts: this.defaultJobMaxAttempts,
            timeoutMs: this.defaultJobTimeoutMs,
            ...(payload && { payload: payload as Prisma.InputJsonValue }),
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Une opération est déjà en cours sur ce serveur. ' +
            "Attendez sa fin ou annulez-la avant d'en lancer une nouvelle.",
        );
      }
      throw error;
    }
  }

  toPublicJob(job: ServerJob): ServerJobPublic {
    const { payload, ...publicJob } = job;
    const preparationId =
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      typeof (payload as Record<string, unknown>).preparationId === 'string'
        ? ((payload as Record<string, unknown>).preparationId as string)
        : null;
    return { ...publicJob, preparationId };
  }

  private resolveDefaultJobTimeoutMs(): number {
    const candidate = Number(
      this.configService.get<string>('SERVER_JOB_TIMEOUT_MS', '300000'),
    );
    if (Number.isFinite(candidate) && candidate >= 10_000) {
      return Math.floor(candidate);
    }
    return 120_000;
  }
}
