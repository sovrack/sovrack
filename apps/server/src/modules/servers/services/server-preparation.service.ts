import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Server,
  ServerJobStatus,
  ServerJobType,
  ServerLogLevel,
  ServerPreparation,
  ServerPreparationStatus,
  ServerPreparationTaskStatus,
  ServerStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { StartServerPreparationDto } from '../dto/start-server-preparation.dto';
import { RetryServerPreparationDto } from '../dto/retry-server-preparation.dto';
import {
  PREPARATION_PROFILE_DEFAULTS,
  PREPARATION_OPTIONS,
  PreparationRoleKey,
  resolvePreparationOptions,
} from '../shared/server-preparation-options';
import { AnsibleExecutionService } from './ansible-execution.service';
import { ServerAuditService } from './server-audit.service';
import { ServerDetectionService } from './server-detection.service';
import { ServerPreparationGateway } from '../server-preparation.gateway';
import { ServerVerificationService } from './server-verification.service';
import { ServersJobsService } from './servers-jobs.service';
import { ServersSshService } from './servers-ssh.service';

type StartPreparationOptions = {
  retryOfPreparationId?: string;
  triggerSource?: string;
  forcedRoles?: PreparationRoleKey[];
};

type ServerPreparationReadiness = {
  serverId: string;
  isReady: boolean;
  checks: {
    serverActive: boolean;
    serverNotDisabled: boolean;
    sshValidated: boolean;
    sshReachable: boolean;
    authSucceeded: boolean;
    sudoAvailable: boolean;
    noActivePreparation: boolean;
  };
  blockingReasons: string[];
  latestValidationAt: Date | null;
};

const ACTIVE_PREPARATION_STATUSES: ServerPreparationStatus[] = [
  ServerPreparationStatus.QUEUED,
  ServerPreparationStatus.RESOLVING_OPTIONS,
  ServerPreparationStatus.WAITING_FOR_LOCK,
  ServerPreparationStatus.RUNNING,
];

const ALLOWED_PREPARATION_TRANSITIONS: Record<
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
export class ServerPreparationService {
  private readonly logger = new Logger(ServerPreparationService.name);
  private readonly runningControllers = new Map<string, AbortController>();
  private readonly currentRoleByPreparation = new Map<
    string,
    PreparationRoleKey
  >();
  private readonly knownRoleKeys = new Set<PreparationRoleKey>([
    'common',
    'docker',
    'nginx',
    'nodejs',
    'postgres',
    'redis',
    'gitlab_runner',
    'firewall',
    'fail2ban',
    'ssl',
    'monitoring',
    'node_exporter',
    'cadvisor',
    'prometheus',
    'grafana',
    'alertmanager',
    'backup',
    'logrotate',
    'swap',
    'security_hardening',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: ServersJobsService,
    private readonly ssh: ServersSshService,
    private readonly verification: ServerVerificationService,
    private readonly ansible: AnsibleExecutionService,
    private readonly detection: ServerDetectionService,
    private readonly audit: ServerAuditService,
    private readonly gateway: ServerPreparationGateway,
  ) {}

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
    const activePreparationCount = await this.prisma.serverPreparation.count({
      where: { serverId, status: { in: ACTIVE_PREPARATION_STATUSES } },
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

    const blockingReasons: string[] = [];
    if (!checks.serverActive || !checks.serverNotDisabled) {
      blockingReasons.push('Le serveur est désactivé.');
    }
    if (!checks.sshValidated) {
      blockingReasons.push(
        'La validation SSH doit réussir avant la préparation.',
      );
    }
    if (!checks.sshReachable || !checks.authSucceeded) {
      blockingReasons.push('Dernière validation SSH absente ou échouée.');
    }
    if (!checks.sudoAvailable) {
      blockingReasons.push(
        'sudo sans mot de passe doit être validé pour préparer ce serveur.',
      );
    }
    if (!checks.noActivePreparation) {
      blockingReasons.push(
        'Une préparation serveur est déjà en cours pour ce VPS.',
      );
    }

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
  ): Promise<ServerPreparation> {
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

    let preparation!: ServerPreparation;
    try {
      preparation = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${server.id}))`;
        const active = await tx.serverPreparation.count({
          where: {
            serverId: server.id,
            status: { in: ACTIVE_PREPARATION_STATUSES },
          },
        });
        if (active > 0) {
          throw new BadRequestException(
            'Une préparation serveur est déjà en cours pour ce VPS.',
          );
        }

        const created = await tx.serverPreparation.create({
          data: {
            serverId: server.id,
            status: ServerPreparationStatus.QUEUED,
            profile: resolved.profile,
            triggerSource: options?.triggerSource ?? 'USER',
            requestedById: actorId,
            selectedOptionsJson: {
              ...resolved.selectedOptions,
              _gitlabRunnerExecutor: resolved.gitlabRunnerExecutor,
            } as Prisma.InputJsonValue,
            resolvedRolesJson: resolvedRoles as Prisma.InputJsonValue,
            retryOfPreparationId: options?.retryOfPreparationId,
            tasks: {
              create: resolvedRoles.map((roleKey, index) => ({
                roleKey,
                taskName: this.roleDisplayName(roleKey),
                orderIndex: index + 1,
                status: ServerPreparationTaskStatus.PENDING,
              })),
            },
          },
          include: { tasks: { orderBy: { orderIndex: 'asc' } } },
        });

        await tx.server.update({
          where: { id: server.id },
          data: {
            status: ServerStatus.PREPARATION_PENDING,
            onboardingStep: 'PREPARATION_PENDING',
          },
        });

        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Une préparation serveur est déjà en cours pour ce VPS.',
        );
      }
      throw error;
    }

    const job = await this.jobs.createJob(
      server.id,
      ServerJobType.PREPARE_SERVER,
      {
        preparationId: preparation.id,
        selectedOptions: resolved.selectedOptions,
        resolvedRoles,
        retryOfPreparationId: options?.retryOfPreparationId ?? null,
      },
    );

    await this.audit.record(server.id, 'SERVER_PREPARATION_START', actorId, {
      preparationId: preparation.id,
      profile: resolved.profile,
      roles: resolvedRoles,
    });

    this.runPreparationInBackground(
      server,
      preparation.id,
      job.id,
      resolvedRoles,
    );
    return preparation;
  }

  async listPreparations(serverId: string) {
    await this.getServer(serverId);
    return await this.prisma.serverPreparation.findMany({
      where: { serverId },
      include: { tasks: { orderBy: { orderIndex: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPreparation(id: string) {
    const preparation = await this.prisma.serverPreparation.findUnique({
      where: { id },
      include: { tasks: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!preparation) {
      throw new NotFoundException('Préparation serveur introuvable');
    }
    return preparation;
  }

  async getPreparationLogs(id: string, afterLine?: number) {
    await this.getPreparation(id);
    return await this.prisma.serverPreparationLog.findMany({
      where: {
        preparationId: id,
        ...(afterLine ? { lineNumber: { gt: afterLine } } : {}),
      },
      orderBy: { lineNumber: 'asc' },
      take: 1_000,
    });
  }

  async retryPreparation(
    id: string,
    dto: RetryServerPreparationDto,
    actorId?: string,
  ): Promise<ServerPreparation> {
    const previous = await this.getPreparation(id);
    const rawOptions = previous.selectedOptionsJson as Record<string, unknown>;
    const { _gitlabRunnerExecutor, ...boolOptions } = rawOptions;
    const restoredRoles = Array.isArray(previous.resolvedRolesJson)
      ? previous.resolvedRolesJson
          .filter((role): role is string => typeof role === 'string')
          .filter((role): role is PreparationRoleKey =>
            this.knownRoleKeys.has(role as PreparationRoleKey),
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
        profile: previous.profile,
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
    const controller = this.runningControllers.get(id);
    if (controller) {
      controller.abort();
    }

    if (!ACTIVE_PREPARATION_STATUSES.includes(preparation.status)) {
      throw new BadRequestException(
        'Cette préparation ne peut plus être annulée.',
      );
    }

    await this.transitionPreparation(id, ServerPreparationStatus.CANCELED, {
      finishedAt: new Date(),
      summary: 'Préparation annulée par un administrateur.',
    });
    const updated = await this.getPreparation(id);

    await this.prisma.server.update({
      where: { id: preparation.serverId },
      data: { status: ServerStatus.PREPARATION_FAILED },
    });
    await this.audit.record(
      preparation.serverId,
      'SERVER_PREPARATION_CANCEL',
      actorId,
      {
        preparationId: id,
      },
    );
    this.gateway.emitFinished({ preparationId: id, status: updated.status });
    return updated;
  }

  private runPreparationInBackground(
    server: Server,
    preparationId: string,
    jobId: string,
    roles: PreparationRoleKey[],
  ): void {
    void this.executePreparation(server, preparationId, jobId, roles).catch(
      (error) => {
        this.logger.error(
          `Preparation ${preparationId} background execution failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    );
  }

  private async executePreparation(
    server: Server,
    preparationId: string,
    jobId: string,
    roles: PreparationRoleKey[],
  ): Promise<void> {
    const timeoutMs = this.resolvePreparationTimeoutMs();
    const abortController = new AbortController();
    this.runningControllers.set(preparationId, abortController);

    try {
      await this.transitionPreparation(
        preparationId,
        ServerPreparationStatus.RESOLVING_OPTIONS,
      );
      await this.transitionPreparation(
        preparationId,
        ServerPreparationStatus.WAITING_FOR_LOCK,
      );

      const job = await this.prisma.serverJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      await this.jobs.assertJobLock(job);
      await this.transitionPreparation(
        preparationId,
        ServerPreparationStatus.RUNNING,
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

      const preparation = await this.prisma.serverPreparation.findUniqueOrThrow(
        {
          where: { id: preparationId },
        },
      );
      const rawOptions = preparation.selectedOptionsJson as Record<
        string,
        unknown
      >;
      const { _gitlabRunnerExecutor, ...boolOptions } = rawOptions;
      const selectedOptions = boolOptions as Record<string, boolean>;
      const gitlabRunnerExecutor =
        typeof _gitlabRunnerExecutor === 'string' &&
        _gitlabRunnerExecutor.length > 0
          ? _gitlabRunnerExecutor
          : 'docker';

      await this.ssh.withTimeout(
        async () =>
          await this.ansible.runPreparation(
            server,
            {
              roles,
              selectedOptions,
              gitlabRunnerExecutor,
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

      await this.markAllRemainingTasks(
        preparationId,
        ServerPreparationTaskStatus.OK,
      );
      await this.transitionPreparation(
        preparationId,
        ServerPreparationStatus.SUCCEEDED,
        {
          finishedAt: new Date(),
          summary: 'Préparation serveur terminée avec succès.',
        },
      );
      await this.prisma.serverJob.update({
        where: { id: jobId },
        data: {
          status: ServerJobStatus.SUCCESS,
          output: 'Préparation serveur terminée avec succès',
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
        preparationId,
        status: ServerPreparationStatus.SUCCEEDED,
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
    const current = await this.prisma.serverPreparation.findUnique({
      where: { id: preparationId },
      select: { status: true },
    });
    if (current?.status === ServerPreparationStatus.CANCELED) {
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
    await this.markFailedRunningTasks(preparationId, isTimeout);
    const hasSuccessfulTask =
      (await this.prisma.serverPreparationTask.count({
        where: {
          preparationId,
          status: {
            in: [
              ServerPreparationTaskStatus.OK,
              ServerPreparationTaskStatus.CHANGED,
            ],
          },
        },
      })) > 0;
    const prepStatus = isTimeout
      ? ServerPreparationStatus.TIMEOUT
      : hasSuccessfulTask
        ? ServerPreparationStatus.PARTIAL
        : ServerPreparationStatus.FAILED;
    const serverStatus = hasSuccessfulTask
      ? ServerStatus.PARTIALLY_PREPARED
      : ServerStatus.PREPARATION_FAILED;

    await this.transitionPreparation(preparationId, prepStatus, {
      finishedAt: new Date(),
      errorMessage: this.redactSecrets(message),
      summary: hasSuccessfulTask
        ? 'Préparation partielle: certains rôles ont réussi avant l’échec.'
        : 'Préparation échouée.',
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
      data: { status: serverStatus, onboardingStep: serverStatus },
    });
    await this.appendLog(
      preparationId,
      ServerLogLevel.ERROR,
      'orchestrator',
      this.redactSecrets(message),
    );
    this.gateway.emitFinished({
      preparationId,
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
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`prep-log:${preparationId}`}))`;
      const lastLine = await tx.serverPreparationLog.findFirst({
        where: { preparationId },
        orderBy: { lineNumber: 'desc' },
        select: { lineNumber: true },
      });
      return await tx.serverPreparationLog.create({
        data: {
          preparationId,
          level,
          source,
          message: this.redactSecrets(message),
          lineNumber: (lastLine?.lineNumber ?? 0) + 1,
        },
      });
    });
    this.gateway.emitLog(created);
  }

  private async updateRoleStateFromLog(
    preparationId: string,
    message: string,
  ): Promise<void> {
    const match = message.match(/^TASK \[([^\]:]+)(?::|\])/);
    const rawRole = match?.[1]?.trim().replace(/-/g, '_');
    if (!rawRole || !this.knownRoleKeys.has(rawRole as PreparationRoleKey)) {
      return;
    }

    const roleKey = rawRole as PreparationRoleKey;
    const previous = this.currentRoleByPreparation.get(preparationId);
    if (previous && previous !== roleKey) {
      await this.prisma.serverPreparationTask.updateMany({
        where: {
          preparationId,
          roleKey: previous,
          status: ServerPreparationTaskStatus.RUNNING,
        },
        data: {
          status: ServerPreparationTaskStatus.OK,
          finishedAt: new Date(),
        },
      });
    }

    this.currentRoleByPreparation.set(preparationId, roleKey);
    await this.prisma.serverPreparationTask.updateMany({
      where: {
        preparationId,
        roleKey,
        status: ServerPreparationTaskStatus.PENDING,
      },
      data: {
        status: ServerPreparationTaskStatus.RUNNING,
        startedAt: new Date(),
      },
    });
  }

  private async transitionPreparation(
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

  private async markAllRemainingTasks(
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

  private async markFailedRunningTasks(
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

  private async refreshDetectionAfterPreparation(
    server: Server,
    preparationId: string,
  ): Promise<void> {
    try {
      const current = await this.getServer(server.id);
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

  private roleDisplayName(role: PreparationRoleKey): string {
    return role.replace(/_/g, ' ');
  }

  private resolvePreparationTimeoutMs(): number {
    const candidate = Number(process.env.SERVER_PREPARATION_TIMEOUT_MS);
    if (Number.isFinite(candidate) && candidate >= 60_000) {
      return Math.floor(candidate);
    }
    return 900_000;
  }

  private redactSecrets(value: string): string {
    return value
      .replace(/(--private-key\s+)\S+/gi, '$1[redacted]')
      .replace(/(registration-token\s+)\S+/gi, '$1[redacted]')
      .replace(/(token=)\S+/gi, '$1[redacted]')
      .replace(/(password=)\S+/gi, '$1[redacted]');
  }
}
