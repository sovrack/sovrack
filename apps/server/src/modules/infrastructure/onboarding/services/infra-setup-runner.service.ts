import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { redactSecrets as redactSecretsUtil } from '../../../../shared/security/redact';
import { DockerConnectionsService } from '../../../../adapters/container-runtime/docker-connections.service';
import { ServersJobsService } from '../../servers/services/servers-jobs.service';
import { ServersConnectionService } from '../../servers/services/servers-connection.service';
import { ServersDetectionService } from '../../servers/services/servers-detection.service';
import { ServersAuditService } from '../../servers/services/servers-audit.service';
import {
  ServerSetupAnsibleService,
  type DockerTlsMaterial,
} from './server-setup-ansible.service';
import { ServerSetupGateway } from '../gateways/server-setup.gateway';
import {
  ServerSetupStateService,
  ACTIVE_PREPARATION_STATUSES,
} from './setup/server-setup-state.service';
import { ServerRunsService } from '../../server-runs/server-runs.service';
import {
  ROLE_ORDER,
  ResolvedPreparation,
  SetupRoleKey,
} from '../../servers/shared/server-setup-options';
import {
  parseRoleFromAnsibleLogLine,
  resolveSetupFailureOutcome,
  roleDisplayName,
  computeSetupTimeoutMs,
} from './infra-setup.util';
import {
  runWithStepsInclude,
  RunWithSteps,
  StartPreparationOptions,
} from './infra-setup-planning.util';

@Injectable()
export class InfraSetupRunnerService {
  private readonly logger = new Logger(InfraSetupRunnerService.name);
  private readonly runningControllers = new Map<string, AbortController>();
  private readonly currentRoleByPreparation = new Map<string, SetupRoleKey>();
  readonly knownRoleKeys = new Set<SetupRoleKey>(ROLE_ORDER);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: ServersJobsService,
    private readonly ssh: ServersConnectionService,
    private readonly ansible: ServerSetupAnsibleService,
    private readonly detection: ServersDetectionService,
    private readonly audit: ServersAuditService,
    private readonly gateway: ServerSetupGateway,
    private readonly configService: ConfigService,
    private readonly state: ServerSetupStateService,
    private readonly serverRuns: ServerRunsService,
    private readonly dockerConnections: DockerConnectionsService,
  ) {}

  /**
   * Creates the preparation ServerRun record and its per-role steps inside a
   * single advisory-lock transaction, then updates the server status to
   * PREPARATION_PENDING. Returns the created run with steps included.
   */
  async createRun(
    server: Server,
    resolved: ResolvedPreparation,
    resolvedRoles: SetupRoleKey[],
    options?: StartPreparationOptions,
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
            status: { in: ACTIVE_PREPARATION_STATUSES },
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
              ...resolved.selectedOptions,
              _gitlabRunnerExecutor: resolved.gitlabRunnerExecutor,
              _reinstallOptions: [...(resolved.reinstallOptions ?? [])],
            } as Prisma.InputJsonValue,
            resolvedJson: resolvedRoles as Prisma.InputJsonValue,
            retryOfId: options?.retryOfPreparationId,
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
    preparationId: string,
    jobId: string,
    roles: SetupRoleKey[],
  ): void {
    void this.execute(server, preparationId, jobId, roles).catch((error) => {
      this.logger.error(
        `Preparation ${preparationId} background execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  /** Aborts a running preparation by its ID. No-op if none is running. */
  abort(preparationId: string): void {
    this.runningControllers.get(preparationId)?.abort();
  }

  private async execute(
    server: Server,
    preparationId: string,
    jobId: string,
    roles: SetupRoleKey[],
  ): Promise<void> {
    const timeoutMs = this.resolvePreparationTimeoutMs(roles);
    const abortController = new AbortController();
    this.runningControllers.set(preparationId, abortController);

    try {
      await this.state.transitionPreparation(
        preparationId,
        ServerRunStatus.RESOLVING_OPTIONS,
      );
      await this.state.transitionPreparation(
        preparationId,
        ServerRunStatus.WAITING_FOR_LOCK,
      );

      const job = await this.prisma.serverJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      await this.jobs.assertJobLock(job);
      await this.state.transitionPreparation(
        preparationId,
        ServerRunStatus.RUNNING,
      );
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
        preparationId,
        ServerLogLevel.INFO,
        'orchestrator',
        'Starting server preparation from the control node. The target VPS will not install Ansible.',
      );

      const run = await this.prisma.serverRun.findUniqueOrThrow({
        where: { id: preparationId },
      });
      const rawOptions = run.paramsJson as Record<string, unknown>;
      const { _gitlabRunnerExecutor, _reinstallOptions, ...boolOptions } =
        rawOptions;
      const selectedOptions = boolOptions as Record<string, boolean>;
      const gitlabRunnerExecutor =
        typeof _gitlabRunnerExecutor === 'string' &&
        _gitlabRunnerExecutor.length > 0
          ? _gitlabRunnerExecutor
          : 'docker';
      const reinstallOptions = Array.isArray(_reinstallOptions)
        ? (_reinstallOptions as string[]).filter(
            (v): v is string => typeof v === 'string',
          )
        : [];

      const runResult = await this.ssh.withTimeout(
        async () =>
          await this.ansible.runPreparation(
            server,
            {
              roles,
              selectedOptions,
              gitlabRunnerExecutor,
              reinstallOptions,
            },
            { signal: abortController.signal, timeoutMs },
            {
              onLog: async (event) => {
                await this.updateRoleStateFromLog(preparationId, event.message);
                await this.appendLog(
                  preparationId,
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
        await this.registerDockerTlsConnection(
          server,
          preparationId,
          runResult.dockerTls,
        );
      }

      await this.state.markAllRemainingTasks(
        preparationId,
        ServerRunStepStatus.OK,
      );
      await this.state.transitionPreparation(
        preparationId,
        ServerRunStatus.SUCCEEDED,
        {
          finishedAt: new Date(),
          summary: 'Server provisioning completed successfully.',
        },
      );
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
        preparationId,
        ServerLogLevel.INFO,
        'orchestrator',
        'Preparation completed successfully.',
      );
      await this.refreshDetectionAfterPreparation(server, preparationId);
      this.gateway.emitFinished({
        setupId: preparationId,
        status: ServerRunStatus.SUCCEEDED,
      });
    } catch (error) {
      await this.handlePreparationFailure(
        server.id,
        preparationId,
        jobId,
        error,
      );
    } finally {
      this.runningControllers.delete(preparationId);
      this.currentRoleByPreparation.delete(preparationId);
    }
  }

  private async handlePreparationFailure(
    serverId: string,
    preparationId: string,
    jobId: string,
    error: unknown,
  ): Promise<void> {
    const current = await this.prisma.serverRun.findUnique({
      where: { id: preparationId },
      select: { status: true },
    });
    if (current?.status === ServerRunStatus.CANCELED) {
      await this.prisma.serverJob.update({
        where: { id: jobId },
        data: {
          status: ServerJobStatus.FAILED,
          error: 'Preparation canceled by administrator',
          finishedAt: new Date(),
        },
      });
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = message.startsWith('JOB_TIMEOUT_');
    await this.state.markFailedRunningTasks(preparationId, isTimeout);
    const hasSuccessfulTask =
      (await this.prisma.serverRunStep.count({
        where: {
          runId: preparationId,
          status: {
            in: [ServerRunStepStatus.OK, ServerRunStepStatus.CHANGED],
          },
        },
      })) > 0;

    const { prepStatus, serverStatus, displayError, displaySummary } =
      resolveSetupFailureOutcome(message, hasSuccessfulTask);

    await this.state.transitionPreparation(preparationId, prepStatus, {
      finishedAt: new Date(),
      errorMessage: this.redactSecrets(displayError),
      summary: displaySummary,
    });
    await this.prisma.serverJob.update({
      where: { id: jobId },
      data: {
        status: isTimeout ? ServerJobStatus.TIMEOUT : ServerJobStatus.FAILED,
        error: this.redactSecrets(message),
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
      preparationId,
      ServerLogLevel.ERROR,
      'orchestrator',
      this.redactSecrets(message),
    );
    this.gateway.emitFinished({
      setupId: preparationId,
      status: prepStatus,
      errorMessage: this.redactSecrets(message),
    });
  }

  private async appendLog(
    preparationId: string,
    level: ServerLogLevel,
    source: string,
    message: string,
  ): Promise<void> {
    const created = await this.serverRuns.appendLog(preparationId, {
      level,
      source,
      message: this.redactSecrets(message),
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

  private async updateRoleStateFromLog(
    preparationId: string,
    message: string,
  ): Promise<void> {
    const roleKey = parseRoleFromAnsibleLogLine(message, this.knownRoleKeys);
    if (!roleKey) return;

    const previous = this.currentRoleByPreparation.get(preparationId);
    if (previous && previous !== roleKey) {
      await this.prisma.serverRunStep.updateMany({
        where: {
          runId: preparationId,
          roleKey: previous,
          status: ServerRunStepStatus.RUNNING,
        },
        data: { status: ServerRunStepStatus.OK, finishedAt: new Date() },
      });
    }

    this.currentRoleByPreparation.set(preparationId, roleKey);
    await this.prisma.serverRunStep.updateMany({
      where: {
        runId: preparationId,
        roleKey,
        status: ServerRunStepStatus.PENDING,
      },
      data: { status: ServerRunStepStatus.RUNNING, startedAt: new Date() },
    });
  }

  /**
   * Enregistre la DockerConnection (endpoint mTLS 2376) à partir des certs
   * client rapatriés par le rôle docker_tls. Chiffrement au repos identique à
   * la saisie manuelle (DockerConnectionsService.upsert). Un échec ici ne fait
   * PAS échouer la préparation (le serveur EST préparé) : il est loggé en
   * ERROR et l'enregistrement manuel reste possible via l'API existante.
   * AUCUN contenu PEM n'est loggé — uniquement l'endpoint et l'issue.
   */
  private async registerDockerTlsConnection(
    server: Server,
    preparationId: string,
    material: DockerTlsMaterial | null,
  ): Promise<void> {
    if (!material) {
      await this.appendLog(
        preparationId,
        ServerLogLevel.ERROR,
        'orchestrator',
        'docker_tls: run succeeded but client certificates were not retrieved — ' +
          'Docker connection NOT registered. Register it manually via ' +
          'POST /servers/:id/docker-connection.',
      );
      return;
    }

    const endpoint = `tcp://${server.host}:2376`;
    try {
      await this.dockerConnections.upsert({
        serverId: server.id,
        endpoint,
        tlsCaCert: material.ca,
        tlsClientCert: material.cert,
        tlsClientKey: material.key,
      });
      await this.appendLog(
        preparationId,
        ServerLogLevel.INFO,
        'orchestrator',
        `Docker TLS connection registered automatically (${endpoint}).`,
      );
      await this.audit.record(
        server.id,
        'DOCKER_CONNECTION_AUTO_REGISTERED',
        null,
        {
          endpoint,
          via: 'preparation:docker_tls',
        },
      );
    } catch (error) {
      await this.appendLog(
        preparationId,
        ServerLogLevel.ERROR,
        'orchestrator',
        `docker_tls: automatic Docker connection registration failed: ${
          error instanceof Error ? error.message : String(error)
        }. Register it manually via POST /servers/:id/docker-connection.`,
      );
      return;
    }

    // Probe best-effort : vérifie tout de suite que le démon répond en mTLS.
    try {
      const probe = await this.dockerConnections.probeReachability(server.id);
      await this.appendLog(
        preparationId,
        ServerLogLevel.INFO,
        'orchestrator',
        `Docker TLS connection verified (API v${probe.apiVersion ?? '?'}, ${String(probe.latencyMs)}ms).`,
      );
    } catch (error) {
      await this.appendLog(
        preparationId,
        ServerLogLevel.WARNING,
        'orchestrator',
        `Docker TLS connection registered but probe failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async refreshDetectionAfterPreparation(
    server: Server,
    preparationId: string,
  ): Promise<void> {
    try {
      const current = await this.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      });
      await this.detection.detect(current);
    } catch (error) {
      await this.appendLog(
        preparationId,
        ServerLogLevel.WARNING,
        'orchestrator',
        `Preparation succeeded but post-detection failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private resolvePreparationTimeoutMs(roles: string[] = []): number {
    const fromEnv = Number(
      this.configService.get<string>('SERVER_PREPARATION_TIMEOUT_MS', '0'),
    );
    return computeSetupTimeoutMs(roles, fromEnv);
  }

  private redactSecrets(value: string): string {
    return redactSecretsUtil(value);
  }
}
