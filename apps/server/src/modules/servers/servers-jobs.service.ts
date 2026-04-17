import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ServerJob,
  ServerJobStatus,
  ServerJobType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ServersSshService } from './servers-ssh.service';
import { InstallToolsDto, ServerJobPublic } from './servers.types';

@Injectable()
export class ServersJobsService {
  private readonly defaultJobTimeoutMs = 45_000;
  private readonly defaultJobMaxAttempts = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ssh: ServersSshService,
  ) {}

  async listJobs(id: string): Promise<ServerJobPublic[]> {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException('Serveur non trouvé');
    }

    const jobs = await this.prisma.serverJob.findMany({
      where: { serverId: id },
      orderBy: { createdAt: 'desc' },
    });

    return jobs.map((job) => this.toPublicJob(job));
  }

  async retryJob<T>(
    id: string,
    jobId: string,
    handlers: {
      verify: () => Promise<T>;
      install: (payload?: InstallToolsDto) => Promise<T>;
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

    throw new BadRequestException(
      'Ce type de job nécessite des paramètres non rejouables',
    );
  }

  async executeJobWithRetry<T>(
    job: ServerJob,
    task: () => Promise<T>,
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
        const result = await this.ssh.withTimeout(task(), job.timeoutMs);

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

  async markJobAgentPending(jobId: string, output: string): Promise<void> {
    await this.prisma.serverJob.update({
      where: { id: jobId },
      data: {
        status: ServerJobStatus.AGENT_PENDING,
        output,
      },
    });
  }

  toPublicJob(job: ServerJob): ServerJobPublic {
    const { payload, ...publicJob } = job;
    void payload;
    return publicJob;
  }
}
