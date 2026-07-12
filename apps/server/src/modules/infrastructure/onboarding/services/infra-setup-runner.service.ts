import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  Server,
  ServerJobStatus,
  ServerLogLevel,
  ServerOnboardingStep,
  ServerRunKind,
  ServerRunStatus,
  ServerRunStepStatus,
  ServerStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ServersJobsService } from '../../servers/services/servers-jobs.service';
import { ServersConnectionService } from '../../servers/services/servers-connection.service';
import { ServerSetupAnsibleService } from './server-setup-ansible.service';
import { ServerSetupGateway } from '../gateways/server-setup.gateway';
import {
  ServerSetupStateService,
  ACTIVE_SETUP_STATUSES,
} from './setup/server-setup-state.service';
import { ServerRunsService } from '../../server-runs/server-runs.service';
import {
  ROLE_ORDER,
  ResolvedSetup,
  SetupRoleKey,
} from '../../servers/shared/server-setup';
import {
  resolveSetupFailureOutcome,
  roleDisplayName,
  computeSetupTimeoutMs,
} from './infra-setup.util';
import {
  runWithStepsInclude,
  RunWithSteps,
  StartSetupOptions,
} from './infra-setup-planning.util';
import { updateRoleStateFromLog, redactSecrets } from './setup-log-utils';
import { SetupPostProcessorService } from './setup-post-processor.service';
import {
  SERVER_SETUP_COMPLETED,
  type ServerSetupCompletedEvent,
} from '../../../../shared/events/events.catalog';

@Injectable()
export class InfraSetupRunnerService {
  private readonly logger = new Logger(InfraSetupRunnerService.name);
  private readonly runningControllers = new Map<string, AbortController>();
  private readonly currentRoleBySetup = new Map<string, SetupRoleKey>();
  readonly knownRoleKeys = new Set<SetupRoleKey>(ROLE_ORDER);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: ServersJobsService,
    private readonly ssh: ServersConnectionService,
    private readonly ansible: ServerSetupAnsibleService,
    private readonly gateway: ServerSetupGateway,
    private readonly configService: ConfigService,
    private readonly state: ServerSetupStateService,
    private readonly serverRuns: ServerRunsService,
    private readonly postProcessor: SetupPostProcessorService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Creates the setup ServerRun record and its per-role steps inside a
   * single advisory-lock transaction, then updates the server status to
   * PREPARATION_PENDING. Returns the created run with steps included.
   */
  async createRun(
    server: Server,
    resolved: ResolvedSetup,
    resolvedRoles: SetupRoleKey[],
    options?: StartSetupOptions,
    actorId?: string,
  ): Promise<RunWithSteps> {
    let created: RunWithSteps;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${server.id}))`;

        const active = await tx.serverRun.count({
          where: {
            serverId: server.id,
            kind: ServerRunKind.PREPARATION,
            status: { in: ACTIVE_SETUP_STATUSES },
          },
        });
        if (active > 0) {
          throw new BadRequestException(
            'Un setup serveur est déjà en cours pour ce VPS.',
          );
        }

        const activeJobs = await tx.serverJob.count({
          where: {
            serverId: server.id,
            status: {
              in: [ServerJobStatus.RUNNING, ServerJobStatus.PENDING],
            },
          },
        });
        if (activeJobs > 0) {
          throw new ConflictException(
            'Un job est déjà en cours sur ce serveur. Attendez sa fin ou annulez-le avant de préparer.',
          );
        }

        const run = await tx.serverRun.create({
          data: {
            kind: ServerRunKind.PREPARATION,
            serverId: server.id,
            status: ServerRunStatus.QUEUED,
            profile: resolved.profile,
            triggerSource: options?.triggerSource ?? 'USER',
            requestedById: actorId,
            paramsJson: {
              _gitlabRunnerExecutor: resolved.gitlabRunnerExecutor,
            } as Prisma.InputJsonValue,
            resolvedJson: resolvedRoles as Prisma.InputJsonValue,
            retryOfId: options?.retryOfSetupId,
            steps: {
              create: resolvedRoles.map((roleKey, index) => ({
                roleKey,
                taskName: roleDisplayName(roleKey),
                orderIndex: index + 1,
                status: ServerRunStepStatus.PENDING,
              })),
            },
          },
          include: runWithStepsInclude,
        });

        await tx.server.update({
          where: { id: server.id },
          data: {
            status: ServerStatus.PREPARATION_PENDING,
            onboardingStep: 'PREPARATION_PENDING',
          },
        });

        return run;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Un setup serveur est déjà en cours pour ce VPS.',
        );
      }
      throw error;
    }

    return created;
  }

  /** Fire-and-forget wrapper around execute(). */
  runInBackground(
    server: Server,
    setupId: string,
    jobId: string,
    roles: SetupRoleKey[],
  ): void {
    void this.execute(server, setupId, jobId, roles).catch((error) => {
      this.logger.error(
        `Setup ${setupId} background execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  /**
   * Awaited entry point for the BullMQ automation worker. Same body as
   * runInBackground, but returns the promise so the queue knows when the run
   * finishes. Errors are swallowed (logged) on purpose: the run's own outcome
   * is the authoritative source of truth (persisted as ServerRun status +
   * ServerRunLog by execute()), not the BullMQ job status — so a failure or an
   * abort must not bubble up and be mistaken for a queue-level fault to retry.
   */
  async runSetupJob(
    server: Server,
    setupId: string,
    jobId: string,
    roles: SetupRoleKey[],
  ): Promise<void> {
    try {
      await this.execute(server, setupId, jobId, roles);
    } catch (error) {
      this.logger.error(
        `Setup ${setupId} worker execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Aborts a running setup by its ID. No-op if none is running. */
  abort(setupId: string): void {
    this.runningControllers.get(setupId)?.abort();
  }

  private async execute(
    server: Server,
    setupId: string,
    jobId: string,
    roles: SetupRoleKey[],
  ): Promise<void> {
    const timeoutMs = this.resolveSetupTimeoutMs(roles);
    const abortController = new AbortController();
    this.runningControllers.set(setupId, abortController);

    try {
      await this.state.transitionSetup(
        setupId,
        ServerRunStatus.RESOLVING_OPTIONS,
      );
      await this.state.transitionSetup(
        setupId,
        ServerRunStatus.WAITING_FOR_LOCK,
      );

      const job = await this.prisma.serverJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      await this.jobs.assertJobLock(job);
      await this.state.transitionSetup(setupId, ServerRunStatus.RUNNING);
      await this.prisma.serverJob.update({
        where: { id: jobId },
        data: {
          status: ServerJobStatus.RUNNING,
          attempts: 1,
          startedAt: new Date(),
          error: null,
        },
      });
      await this.prisma.server.update({
        where: { id: server.id },
        data: { status: ServerStatus.PREPARING, onboardingStep: 'PREPARING' },
      });
      await this.appendLog(
        setupId,
        ServerLogLevel.INFO,
        'orchestrator',
        'Starting server setup from the control node. The target VPS will not install Ansible.',
      );

      const run = await this.prisma.serverRun.findUniqueOrThrow({
        where: { id: setupId },
      });
      const rawOptions = run.paramsJson as Record<string, unknown>;
      const gitlabRunnerExecutor =
        typeof rawOptions._gitlabRunnerExecutor === 'string' &&
        rawOptions._gitlabRunnerExecutor.length > 0
          ? rawOptions._gitlabRunnerExecutor
          : 'docker';

      const runResult = await this.ssh.withTimeout(
        async () =>
          await this.ansible.runSetup(
            server,
            {
              roles,
              gitlabRunnerExecutor,
            },
            { signal: abortController.signal, timeoutMs },
            {
              onLog: async (event) => {
                await updateRoleStateFromLog(
                  setupId,
                  event.message,
                  this.knownRoleKeys,
                  this.currentRoleBySetup,
                  this.prisma,
                );
                await this.appendLog(
                  setupId,
                  event.level,
                  event.source,
                  event.message,
                );
              },
            },
          ),
        timeoutMs,
        () => abortController.abort(),
      );

      // docker_tls sélectionné + run réussi → enregistrer automatiquement la
      // DockerConnection avec les certs rapatriés (même chemin de stockage
      // chiffré que la saisie manuelle via POST /servers/:id/docker-connection,
      // qui reste disponible telle quelle — rétrocompatibilité).
      if (roles.includes('docker_tls')) {
        await this.postProcessor.registerDockerTlsConnection(
          server,
          setupId,
          runResult.dockerTls,
        );
      }

      await this.state.markAllRemainingTasks(setupId, ServerRunStepStatus.OK);
      await this.state.transitionSetup(setupId, ServerRunStatus.SUCCEEDED, {
        finishedAt: new Date(),
        summary: 'Server provisioning completed successfully.',
      });
      await this.prisma.serverJob.update({
        where: { id: jobId },
        data: {
          status: ServerJobStatus.SUCCESS,
          output: 'Setup serveur terminé avec succès',
          finishedAt: new Date(),
        },
      });
      await this.prisma.server.update({
        where: { id: server.id },
        data: {
          status: ServerStatus.PREPARED,
          onboardingStep: 'READY',
          lastPreparedAt: new Date(),
        },
      });
      await this.appendLog(
        setupId,
        ServerLogLevel.INFO,
        'orchestrator',
        'Setup completed successfully.',
      );
      await this.postProcessor.refreshDetectionAfterSetup(server, setupId);
      // Le "Setup Server" installe la stack d'observabilité complète dans son
      // jeu de rôles fixe : on signale la fin de préparation pour que le
      // module observability tamponne `monitoringInstalledAt` + câble les URLs
      // (mêmes conséquences que l'ancienne action install_monitoring_stack,
      // désormais fusionnée dans le setup). Découplé par événement — pas de
      // dépendance directe onboarding → observability.
      this.events.emit(SERVER_SETUP_COMPLETED, {
        serverId: server.id,
        host: server.host,
        roles,
        status: ServerRunStatus.SUCCEEDED,
      } satisfies ServerSetupCompletedEvent);
      this.gateway.emitFinished({
        setupId: setupId,
        status: ServerRunStatus.SUCCEEDED,
      });
    } catch (error) {
      await this.handleSetupFailure(server.id, setupId, jobId, error);
    } finally {
      this.runningControllers.delete(setupId);
      this.currentRoleBySetup.delete(setupId);
    }
  }

  private async handleSetupFailure(
    serverId: string,
    setupId: string,
    jobId: string,
    error: unknown,
  ): Promise<void> {
    const current = await this.prisma.serverRun.findUnique({
      where: { id: setupId },
      select: { status: true },
    });
    if (current?.status === ServerRunStatus.CANCELED) {
      await this.prisma.serverJob.update({
        where: { id: jobId },
        data: {
          status: ServerJobStatus.FAILED,
          error: 'Setup canceled by administrator',
          finishedAt: new Date(),
        },
      });
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = message.startsWith('JOB_TIMEOUT_');
    await this.state.markFailedRunningTasks(setupId, isTimeout);
    const hasSuccessfulTask =
      (await this.prisma.serverRunStep.count({
        where: {
          runId: setupId,
          status: {
            in: [ServerRunStepStatus.OK, ServerRunStepStatus.CHANGED],
          },
        },
      })) > 0;

    const { setupStatus, serverStatus, displayError, displaySummary } =
      resolveSetupFailureOutcome(message, hasSuccessfulTask);

    await this.state.transitionSetup(setupId, setupStatus, {
      finishedAt: new Date(),
      errorMessage: redactSecrets(displayError),
      summary: displaySummary,
    });
    await this.prisma.serverJob.update({
      where: { id: jobId },
      data: {
        status: isTimeout ? ServerJobStatus.TIMEOUT : ServerJobStatus.FAILED,
        error: redactSecrets(message),
        finishedAt: new Date(),
      },
    });
    await this.prisma.server.update({
      where: { id: serverId },
      data: {
        status: serverStatus,
        onboardingStep: ServerOnboardingStep.PREPARATION_FAILED,
      },
    });
    await this.appendLog(
      setupId,
      ServerLogLevel.ERROR,
      'orchestrator',
      redactSecrets(message),
    );
    this.gateway.emitFinished({
      setupId: setupId,
      status: setupStatus,
      errorMessage: redactSecrets(message),
    });
  }

  private async appendLog(
    setupId: string,
    level: ServerLogLevel,
    source: string,
    message: string,
  ): Promise<void> {
    const created = await this.serverRuns.appendLog(setupId, {
      level,
      source,
      message: redactSecrets(message),
    });
    this.gateway.emitLog({
      setupId: created.runId,
      level: created.level,
      source: created.source,
      message: created.message,
      lineNumber: created.lineNumber,
      createdAt: created.createdAt,
    });
  }

  private resolveSetupTimeoutMs(roles: string[] = []): number {
    const fromEnv = Number(
      this.configService.get<string>('SERVER_SETUP_TIMEOUT_MS', '0'),
    );
    return computeSetupTimeoutMs(roles, fromEnv);
  }
}
