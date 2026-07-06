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
  ACTIVE_SETUP_STATUSES,
} from './setup/server-setup-state.service';
import { ServerRunsService } from '../../server-runs/server-runs.service';
import {
  ROLE_ORDER,
  ResolvedSetup,
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
  StartSetupOptions,
} from './infra-setup-planning.util';

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
    private readonly detection: ServersDetectionService,
    private readonly audit: ServersAuditService,
    private readonly gateway: ServerSetupGateway,
    private readonly configService: ConfigService,
    private readonly state: ServerSetupStateService,
    private readonly serverRuns: ServerRunsService,
    private readonly dockerConnections: DockerConnectionsService,
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
              ...resolved.selectedOptions,
              _gitlabRunnerExecutor: resolved.gitlabRunnerExecutor,
              _reinstallOptions: [...(resolved.reinstallOptions ?? [])],
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
          await this.ansible.runSetup(
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
                await this.updateRoleStateFromLog(setupId, event.message);
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
        await this.registerDockerTlsConnection(
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
      await this.refreshDetectionAfterSetup(server, setupId);
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
      setupId,
      ServerLogLevel.ERROR,
      'orchestrator',
      this.redactSecrets(message),
    );
    this.gateway.emitFinished({
      setupId: setupId,
      status: setupStatus,
      errorMessage: this.redactSecrets(message),
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
    setupId: string,
    message: string,
  ): Promise<void> {
    const roleKey = parseRoleFromAnsibleLogLine(message, this.knownRoleKeys);
    if (!roleKey) return;

    const previous = this.currentRoleBySetup.get(setupId);
    if (previous && previous !== roleKey) {
      await this.prisma.serverRunStep.updateMany({
        where: {
          runId: setupId,
          roleKey: previous,
          status: ServerRunStepStatus.RUNNING,
        },
        data: { status: ServerRunStepStatus.OK, finishedAt: new Date() },
      });
    }

    this.currentRoleBySetup.set(setupId, roleKey);
    await this.prisma.serverRunStep.updateMany({
      where: {
        runId: setupId,
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
    setupId: string,
    material: DockerTlsMaterial | null,
  ): Promise<void> {
    if (!material) {
      await this.appendLog(
        setupId,
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
        setupId,
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
          via: 'setup:docker_tls',
        },
      );
    } catch (error) {
      await this.appendLog(
        setupId,
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
        setupId,
        ServerLogLevel.INFO,
        'orchestrator',
        `Docker TLS connection verified (API v${probe.apiVersion ?? '?'}, ${String(probe.latencyMs)}ms).`,
      );
    } catch (error) {
      await this.appendLog(
        setupId,
        ServerLogLevel.WARNING,
        'orchestrator',
        `Docker TLS connection registered but probe failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async refreshDetectionAfterSetup(
    server: Server,
    setupId: string,
  ): Promise<void> {
    try {
      const current = await this.prisma.server.findUniqueOrThrow({
        where: { id: server.id },
      });
      await this.detection.detect(current);
    } catch (error) {
      await this.appendLog(
        setupId,
        ServerLogLevel.WARNING,
        'orchestrator',
        `Setup succeeded but post-detection failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private resolveSetupTimeoutMs(roles: string[] = []): number {
    const fromEnv = Number(
      this.configService.get<string>('SERVER_SETUP_TIMEOUT_MS', '0'),
    );
    return computeSetupTimeoutMs(roles, fromEnv);
  }

  private redactSecrets(value: string): string {
    return redactSecretsUtil(value);
  }
}
