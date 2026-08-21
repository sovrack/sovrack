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
  ServerRunKind,
  ServerRunStatus,
  ServerStatus,
} from '@prisma/client';

import { PrismaService } from '../../../../shared/database/prisma.service';
import { StartServerSetupDto } from '../../servers/dto/start-server-setup.dto';
import { RetryServerSetupDto } from '../../servers/dto/retry-server-setup.dto';
import {
  SetupRoleKey,
  resolveSetupOptions,
} from '../../servers/shared/server-setup';
import { ServersAuditService } from '../../servers/services/servers-audit.service';
import { ServerSetupGateway } from '../gateways/server-setup.gateway';
import { ServersVerificationService } from '../../servers/services/servers-verification.service';
import { ServersJobsService } from '../../servers/services/servers-jobs.service';
import { ServerRunsService } from '../../server-runs/server-runs.service';
import {
  ACTIVE_SETUP_STATUSES,
  ServerSetupStateService,
} from './setup/server-setup-state.service';
import { computeBlockingReasons } from './infra-setup.util';
import {
  runWithStepsInclude,
  toSetupView,
  StartSetupOptions,
  ServerSetupReadiness,
  SetupView,
} from './infra-setup-planning.util';
import { InfraSetupRunnerService } from './infra-setup-runner.service';
import { SetupAbortBridge } from './setup-abort.bridge';
import { QueueService } from '../../../../shared/queue/queue.service';
import { runsBackgroundWork } from '../../../../shared/utils/process-role.util';

export type { SetupTaskView, SetupView } from './infra-setup-planning.util';

@Injectable()
export class ServerSetupService implements OnModuleInit {
  private readonly logger = new Logger(ServerSetupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: ServersJobsService,
    private readonly verification: ServersVerificationService,
    private readonly audit: ServersAuditService,
    private readonly gateway: ServerSetupGateway,
    private readonly state: ServerSetupStateService,
    private readonly serverRuns: ServerRunsService,
    private readonly runner: InfraSetupRunnerService,
    private readonly queue: QueueService,
    private readonly abortBridge: SetupAbortBridge,
  ) {}

  async onModuleInit(): Promise<void> {
    // Startup orphan-recovery only belongs to the process that OWNS setup
    // execution (the worker). An API restart doesn't kill the worker's live
    // setups, so it must not mark active ServerRuns FAILED. Single-process
    // mode ("all") passes this guard and keeps recovering as before.
    if (!runsBackgroundWork()) return;
    const orphaned = await this.prisma.serverRun.findMany({
      where: {
        kind: ServerRunKind.PREPARATION,
        status: { in: ACTIVE_SETUP_STATUSES },
      },
      select: { id: true, serverId: true },
    });

    if (orphaned.length === 0) return;

    this.logger.warn(
      `[startup] Found ${orphaned.length} orphaned setup(s) in active state — marking FAILED`,
    );

    for (const prep of orphaned) {
      try {
        await this.state.transitionSetup(prep.id, ServerRunStatus.FAILED, {
          finishedAt: new Date(),
          summary:
            'Provisioning interrupted during a backend restart. Re-run the provisioning.',
          errorMessage: 'Setup interrompu lors du redémarrage du backend.',
        });
        if (prep.serverId) {
          await this.prisma.server.update({
            where: { id: prep.serverId },
            data: { status: ServerStatus.PREPARATION_FAILED },
          });
        }
      } catch (err) {
        this.logger.error(
          `[startup] Failed to recover orphaned setup ${prep.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async getSetupReadiness(serverId: string): Promise<ServerSetupReadiness> {
    const server = await this.getServer(serverId);
    const validation = await this.verification.latestValidationResult(serverId);
    const activeSetupCount = await this.prisma.serverRun.count({
      where: {
        serverId,
        kind: ServerRunKind.PREPARATION,
        status: { in: ACTIVE_SETUP_STATUSES },
      },
    });

    const checks = {
      serverActive: server.isActive,
      serverNotDisabled: server.status !== ServerStatus.DISABLED,
      sshValidated: server.isVerified,
      sshReachable: Boolean(validation?.sshReachable),
      authSucceeded: Boolean(validation?.authSucceeded),
      sudoAvailable: Boolean(validation?.sudoAvailable),
      noActiveSetup: activeSetupCount === 0,
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

  async startSetup(
    serverId: string,
    dto: StartServerSetupDto | undefined,
    actorId?: string,
    options?: StartSetupOptions,
  ): Promise<SetupView> {
    const server = await this.getServer(serverId);
    await this.assertSetupPrerequisites(server);

    const resolved = resolveSetupOptions(dto);
    // Le jeu fixe de resolveSetupOptions() n'est jamais vide (CORE_ROLES) —
    // resolvedRoles ne peut donc plus jamais être vide, forcedRoles ou pas.
    const resolvedRoles =
      options?.forcedRoles && options.forcedRoles.length > 0
        ? options.forcedRoles
        : resolved.roles;

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
        setupId: created.id,
        resolvedRoles,
        retryOfSetupId: options?.retryOfSetupId ?? null,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Residual race: another job (VERIFY / REGISTER_RUNNER) was created for
        // this server between the setup transaction commit and here. The
        // partial unique index `unique_active_server_job` rejected our
        // PREPARE_SERVER job — roll the now-orphaned setup back to FAILED
        // and surface a clean 409 instead of a 500.
        await this.state.transitionSetup(created.id, ServerRunStatus.FAILED, {
          finishedAt: new Date(),
          summary: 'Another job is already running on this server.',
          errorMessage: 'Un job est déjà en cours sur ce serveur.',
        });
        throw new ConflictException(
          'Un job est déjà en cours sur ce serveur. Attendez sa fin ou annulez-le avant de préparer.',
        );
      }
      throw error;
    }

    await this.audit.record(server.id, 'SERVER_SETUP_START', actorId, {
      setupId: created.id,
      profile: resolved.profile,
      roles: resolvedRoles,
    });

    // Hand the heavy Ansible run to the worker process via the automation
    // queue instead of running it in-process. The API returns immediately; the
    // worker picks it up and streams logs/status back over the (Redis-adapted)
    // WebSocket. In single-process mode the same process consumes the job.
    await this.queue.enqueueSetup({
      workspaceId: server.teamId,
      serverId: server.id,
      setupId: created.id,
      jobId: job.id,
      roles: resolvedRoles,
    });
    return toSetupView(created);
  }

  async listSetups(serverId: string): Promise<SetupView[]> {
    await this.getServer(serverId);
    const runs = await this.prisma.serverRun.findMany({
      where: { serverId, kind: ServerRunKind.PREPARATION },
      include: runWithStepsInclude,
      orderBy: { createdAt: 'desc' },
    });
    return runs.map((run) => toSetupView(run));
  }

  async getSetup(id: string, workspaceId?: string): Promise<SetupView> {
    const run = await this.prisma.serverRun.findFirst({
      where: {
        id,
        kind: ServerRunKind.PREPARATION,
        ...(workspaceId ? { teamId: workspaceId } : {}),
      },
      include: runWithStepsInclude,
    });
    if (!run) {
      throw new NotFoundException('Setup serveur introuvable');
    }
    return toSetupView(run);
  }

  async getSetupLogs(id: string, afterLine?: number, workspaceId?: string) {
    await this.getSetup(id, workspaceId);
    const logs = await this.serverRuns.getLogs(id, afterLine);
    return logs.map((log) => ({
      id: log.id,
      setupId: log.runId,
      level: log.level,
      source: log.source,
      message: log.message,
      lineNumber: log.lineNumber,
      createdAt: log.createdAt,
    }));
  }

  async retrySetup(
    id: string,
    dto: RetryServerSetupDto,
    actorId?: string,
    workspaceId?: string,
  ): Promise<SetupView> {
    const previous = await this.getSetup(id, workspaceId);
    if (!previous.serverId) {
      throw new NotFoundException('Setup serveur introuvable');
    }
    const rawOptions = previous.selectedOptionsJson as Record<string, unknown>;
    const restoredRoles = Array.isArray(previous.resolvedRolesJson)
      ? previous.resolvedRolesJson
          .filter((role): role is string => typeof role === 'string')
          .filter((role): role is SetupRoleKey =>
            this.runner.knownRoleKeys.has(role as SetupRoleKey),
          )
      : [];
    const restoredExecutor =
      typeof rawOptions._gitlabRunnerExecutor === 'string'
        ? rawOptions._gitlabRunnerExecutor
        : 'docker';
    await this.audit.record(previous.serverId, 'SERVER_SETUP_RETRY', actorId, {
      retryOfSetupId: id,
      reason: dto.reason ?? null,
    });
    return await this.startSetup(
      previous.serverId,
      {
        gitlabRunnerExecutor: restoredExecutor,
      } as StartServerSetupDto,
      actorId,
      {
        retryOfSetupId: id,
        triggerSource: 'RETRY',
        forcedRoles: restoredRoles,
      },
    );
  }

  async cancelSetup(id: string, actorId?: string, workspaceId?: string) {
    const setup = await this.getSetup(id, workspaceId);
    const serverId = setup.serverId;
    if (!serverId) {
      throw new NotFoundException('Setup serveur introuvable');
    }

    if (!ACTIVE_SETUP_STATUSES.includes(setup.status)) {
      throw new BadRequestException('Ce setup ne peut plus être annulé.');
    }

    // Relay the abort to whichever process is running this setup (the worker,
    // possibly a different process than this API one) via the Redis bridge.
    await this.abortBridge.requestAbort(id);

    // Immediately release the job lock so a new setup can start without waiting
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

    await this.state.transitionSetup(id, ServerRunStatus.CANCELED, {
      finishedAt: new Date(),
      summary: 'Provisioning canceled by an administrator.',
    });
    const updated = await this.getSetup(id, workspaceId);

    await this.prisma.server.update({
      where: { id: serverId },
      data: { status: ServerStatus.PREPARATION_FAILED },
    });
    await this.audit.record(serverId, 'SERVER_SETUP_CANCEL', actorId, {
      setupId: id,
    });
    this.gateway.emitFinished({ setupId: id, status: updated.status });
    return updated;
  }

  private async assertSetupPrerequisites(server: Server): Promise<void> {
    const readiness = await this.getSetupReadiness(server.id);
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
