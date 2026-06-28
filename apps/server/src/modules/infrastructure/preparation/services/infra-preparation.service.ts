import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  Prisma,
  Server,
  ServerJob,
  ServerJobStatus,
  ServerJobType,
  ServerPreparationProfile,
  ServerRunKind,
  ServerRunStatus,
  ServerStatus,
} from '@prisma/client';

import { PrismaService } from '../../../../shared/database/prisma.service';
import { StartServerPreparationDto } from '../../servers/dto/start-server-preparation.dto';
import { RetryServerPreparationDto } from '../../servers/dto/retry-server-preparation.dto';
import {
  PREPARATION_PROFILE_DEFAULTS,
  PREPARATION_OPTIONS,
  PreparationRoleKey,
  resolvePreparationOptions,
} from '../../servers/shared/server-preparation-options';
import { ServersAuditService } from '../../servers/services/servers-audit.service';
import { ServerPreparationGateway } from '../gateways/server-preparation.gateway';
import { ServerVerificationService } from '../../servers/services/server-verification.service';
import { ServersJobsService } from '../../servers/services/servers-jobs.service';
import { ServerRunsService } from '../../server-runs/server-runs.service';
import {
  ACTIVE_PREPARATION_STATUSES,
  ServerPreparationStateService,
} from './preparation/server-preparation-state.service';
import { computeBlockingReasons } from './infra-preparation.util';
import {
  runWithStepsInclude,
  toPreparationView,
  StartPreparationOptions,
  ServerPreparationReadiness,
  PreparationView,
} from './infra-preparation-planning.util';
import { InfraPreparationRunnerService } from './infra-preparation-runner.service';

export type {
  PreparationTaskView,
  PreparationView,
} from './infra-preparation-planning.util';

@Injectable()
export class ServerPreparationService implements OnModuleInit {
  private readonly logger = new Logger(ServerPreparationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: ServersJobsService,
    private readonly verification: ServerVerificationService,
    private readonly audit: ServersAuditService,
    private readonly gateway: ServerPreparationGateway,
    private readonly state: ServerPreparationStateService,
    private readonly serverRuns: ServerRunsService,
    private readonly runner: InfraPreparationRunnerService,
  ) {}

  async onModuleInit(): Promise<void> {
    const orphaned = await this.prisma.serverRun.findMany({
      where: {
        kind: ServerRunKind.PREPARATION,
        status: { in: ACTIVE_PREPARATION_STATUSES },
      },
      select: { id: true, serverId: true },
    });

    if (orphaned.length === 0) return;

    this.logger.warn(
      `[startup] Found ${orphaned.length} orphaned preparation(s) in active state — marking FAILED`,
    );

    for (const prep of orphaned) {
      try {
        await this.state.transitionPreparation(
          prep.id,
          ServerRunStatus.FAILED,
          {
            finishedAt: new Date(),
            summary:
              'Provisioning interrupted during a backend restart. Re-run the provisioning.',
            errorMessage:
              'Préparation interrompue lors du redémarrage du backend.',
          },
        );
        if (prep.serverId) {
          await this.prisma.server.update({
            where: { id: prep.serverId },
            data: { status: ServerStatus.PREPARATION_FAILED },
          });
        }
      } catch (err) {
        this.logger.error(
          `[startup] Failed to recover orphaned preparation ${prep.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  getOptions() {
    return {
      controlNodeOnly: true,
      message:
        'Ansible is executed from the backend/control node. Target VPS hosts are SSH-managed and do not install Ansible.',
      profiles: ['BASIC', 'WEB', 'DATABASE', 'RUNNER', 'FULL', 'CUSTOM'],
      options: PREPARATION_OPTIONS,
      profileDefaults: PREPARATION_PROFILE_DEFAULTS,
    };
  }

  async getPreparationReadiness(
    serverId: string,
  ): Promise<ServerPreparationReadiness> {
    const server = await this.getServer(serverId);
    const validation = await this.verification.latestValidationResult(serverId);
    const activePreparationCount = await this.prisma.serverRun.count({
      where: {
        serverId,
        kind: ServerRunKind.PREPARATION,
        status: { in: ACTIVE_PREPARATION_STATUSES },
      },
    });

    const checks = {
      serverActive: server.isActive,
      serverNotDisabled: server.status !== ServerStatus.DISABLED,
      sshValidated: server.isVerified,
      sshReachable: Boolean(validation?.sshReachable),
      authSucceeded: Boolean(validation?.authSucceeded),
      sudoAvailable: Boolean(validation?.sudoAvailable),
      noActivePreparation: activePreparationCount === 0,
    };

    const blockingReasons = computeBlockingReasons(checks);

    return {
      serverId,
      isReady: blockingReasons.length === 0,
      checks,
      blockingReasons,
      latestValidationAt: validation?.validatedAt ?? null,
    };
  }

  async startPreparation(
    serverId: string,
    dto: StartServerPreparationDto | undefined,
    actorId?: string,
    options?: StartPreparationOptions,
  ): Promise<PreparationView> {
    const server = await this.getServer(serverId);
    await this.assertPreparationPrerequisites(server);

    const resolved = resolvePreparationOptions(dto);
    const resolvedRoles =
      options?.forcedRoles && options.forcedRoles.length > 0
        ? options.forcedRoles
        : resolved.roles;
    if (resolvedRoles.length === 0) {
      throw new BadRequestException(
        'Au moins une option de préparation doit être sélectionnée.',
      );
    }

    const created = await this.runner.createRun(
      server,
      resolved,
      resolvedRoles,
      options,
      actorId,
    );

    let job: ServerJob;
    try {
      job = await this.jobs.createJob(server.id, ServerJobType.PREPARE_SERVER, {
        preparationId: created.id,
        selectedOptions: resolved.selectedOptions,
        resolvedRoles,
        retryOfPreparationId: options?.retryOfPreparationId ?? null,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Residual race: another job (VERIFY / REGISTER_RUNNER) was created for
        // this server between the preparation transaction commit and here. The
        // partial unique index `unique_active_server_job` rejected our
        // PREPARE_SERVER job — roll the now-orphaned preparation back to FAILED
        // and surface a clean 409 instead of a 500.
        await this.state.transitionPreparation(
          created.id,
          ServerRunStatus.FAILED,
          {
            finishedAt: new Date(),
            summary: 'Another job is already running on this server.',
            errorMessage: 'Un job est déjà en cours sur ce serveur.',
          },
        );
        throw new ConflictException(
          'Un job est déjà en cours sur ce serveur. Attendez sa fin ou annulez-le avant de préparer.',
        );
      }
      throw error;
    }

    await this.audit.record(server.id, 'SERVER_PREPARATION_START', actorId, {
      preparationId: created.id,
      profile: resolved.profile,
      roles: resolvedRoles,
    });

    this.runner.runInBackground(server, created.id, job.id, resolvedRoles);
    return toPreparationView(created);
  }

  async listPreparations(serverId: string): Promise<PreparationView[]> {
    await this.getServer(serverId);
    const runs = await this.prisma.serverRun.findMany({
      where: { serverId, kind: ServerRunKind.PREPARATION },
      include: runWithStepsInclude,
      orderBy: { createdAt: 'desc' },
    });
    return runs.map((run) => toPreparationView(run));
  }

  async getPreparation(id: string): Promise<PreparationView> {
    const run = await this.prisma.serverRun.findFirst({
      where: { id, kind: ServerRunKind.PREPARATION },
      include: runWithStepsInclude,
    });
    if (!run) {
      throw new NotFoundException('Préparation serveur introuvable');
    }
    return toPreparationView(run);
  }

  async getPreparationLogs(id: string, afterLine?: number) {
    await this.getPreparation(id);
    const logs = await this.serverRuns.getLogs(id, afterLine);
    return logs.map((log) => ({
      id: log.id,
      preparationId: log.runId,
      level: log.level,
      source: log.source,
      message: log.message,
      lineNumber: log.lineNumber,
      createdAt: log.createdAt,
    }));
  }

  async retryPreparation(
    id: string,
    dto: RetryServerPreparationDto,
    actorId?: string,
  ): Promise<PreparationView> {
    const previous = await this.getPreparation(id);
    if (!previous.serverId) {
      throw new NotFoundException('Préparation serveur introuvable');
    }
    const rawOptions = previous.selectedOptionsJson as Record<string, unknown>;
    const { _gitlabRunnerExecutor, ...boolOptions } = rawOptions;
    const restoredRoles = Array.isArray(previous.resolvedRolesJson)
      ? previous.resolvedRolesJson
          .filter((role): role is string => typeof role === 'string')
          .filter((role): role is PreparationRoleKey =>
            this.runner.knownRoleKeys.has(role as PreparationRoleKey),
          )
      : [];
    const restoredExecutor =
      typeof _gitlabRunnerExecutor === 'string'
        ? _gitlabRunnerExecutor
        : 'docker';
    await this.audit.record(
      previous.serverId,
      'SERVER_PREPARATION_RETRY',
      actorId,
      {
        retryOfPreparationId: id,
        reason: dto.reason ?? null,
      },
    );
    return await this.startPreparation(
      previous.serverId,
      {
        ...boolOptions,
        profile: previous.profile as ServerPreparationProfile,
        gitlabRunnerExecutor: restoredExecutor,
      } as StartServerPreparationDto,
      actorId,
      {
        retryOfPreparationId: id,
        triggerSource: 'RETRY',
        forcedRoles: restoredRoles,
      },
    );
  }

  async cancelPreparation(id: string, actorId?: string) {
    const preparation = await this.getPreparation(id);
    const serverId = preparation.serverId;
    if (!serverId) {
      throw new NotFoundException('Préparation serveur introuvable');
    }

    if (!ACTIVE_PREPARATION_STATUSES.includes(preparation.status)) {
      throw new BadRequestException(
        'Cette préparation ne peut plus être annulée.',
      );
    }

    this.runner.abort(id);

    // Immediately release the job lock so a new preparation can start without waiting
    const activeJob = await this.prisma.serverJob.findFirst({
      where: {
        serverId,
        status: ServerJobStatus.RUNNING,
      },
      select: { id: true },
    });
    if (activeJob) {
      await this.prisma.serverJob.update({
        where: { id: activeJob.id },
        data: {
          status: ServerJobStatus.FAILED,
          error: 'Annulé par un administrateur.',
          finishedAt: new Date(),
        },
      });
    }

    await this.state.transitionPreparation(id, ServerRunStatus.CANCELED, {
      finishedAt: new Date(),
      summary: 'Provisioning canceled by an administrator.',
    });
    const updated = await this.getPreparation(id);

    await this.prisma.server.update({
      where: { id: serverId },
      data: { status: ServerStatus.PREPARATION_FAILED },
    });
    await this.audit.record(serverId, 'SERVER_PREPARATION_CANCEL', actorId, {
      preparationId: id,
    });
    this.gateway.emitFinished({ preparationId: id, status: updated.status });
    return updated;
  }

  private async assertPreparationPrerequisites(server: Server): Promise<void> {
    const readiness = await this.getPreparationReadiness(server.id);
    if (readiness.isReady) {
      return;
    }
    throw new BadRequestException(
      `Impossible de préparer ce serveur: ${readiness.blockingReasons[0] ?? 'pré-requis non validés.'}`,
    );
  }

  private async getServer(id: string): Promise<Server> {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException('Serveur non trouvé');
    }
    return server;
  }
}
