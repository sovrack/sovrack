import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

import { PrismaService } from '../../../core/database/prisma.service';
import { redactSecrets as redactSecretsUtil } from '../../../core/security/redact';
import { StartServerPreparationDto } from '../../servers/dto/start-server-preparation.dto';
import { RetryServerPreparationDto } from '../../servers/dto/retry-server-preparation.dto';
import {
  PREPARATION_PROFILE_DEFAULTS,
  PREPARATION_OPTIONS,
  PreparationRoleKey,
  ROLE_ORDER,
  resolvePreparationOptions,
} from '../../servers/shared/server-preparation-options';
import { ServerPreparationAnsibleService } from './server-preparation-ansible.service';
import { ServersAuditService } from '../../servers/services/servers-audit.service';
import { ServersDetectionService } from '../../servers/services/servers-detection.service';
import { ServerPreparationGateway } from '../gateways/server-preparation.gateway';
import { ServerVerificationService } from '../../servers/services/server-verification.service';
import { ServersJobsService } from '../../servers/services/servers-jobs.service';
import { ServersConnectionService } from '../../servers/services/servers-connection.service';
import {
  ACTIVE_PREPARATION_STATUSES as STATE_ACTIVE_PREPARATION_STATUSES,
  ServerPreparationStateService,
} from './preparation/server-preparation-state.service';

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

const ACTIVE_PREPARATION_STATUSES = STATE_ACTIVE_PREPARATION_STATUSES;

@Injectable()
export class ServerPreparationService implements OnModuleInit {
  private readonly logger = new Logger(ServerPreparationService.name);
  private readonly runningControllers = new Map<string, AbortController>();
  private readonly currentRoleByPreparation = new Map<
    string,
    PreparationRoleKey
  >();
  // Derived from the single source of truth (ROLE_ORDER) so no role — notably
  // `nixpacks` — can be silently omitted from log-based role tracking or the
  // retry filter again.
  private readonly knownRoleKeys = new Set<PreparationRoleKey>(ROLE_ORDER);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: ServersJobsService,
    private readonly ssh: ServersConnectionService,
    private readonly verification: ServerVerificationService,
    private readonly ansible: ServerPreparationAnsibleService,
    private readonly detection: ServersDetectionService,
    private readonly audit: ServersAuditService,
    private readonly gateway: ServerPreparationGateway,
    private readonly configService: ConfigService,
    private readonly state: ServerPreparationStateService,
  ) {}

  async onModuleInit(): Promise<void> {
    const orphaned = await this.prisma.serverPreparation.findMany({
      where: { status: { in: ACTIVE_PREPARATION_STATUSES } },
      select: { id: true, serverId: true },
    });

    if (orphaned.length === 0) return;

    this.logger.warn(
      `[startup] Found ${orphaned.length} orphaned preparation(s) in active state — marking FAILED`,
    );

    for (const prep of orphaned) {
      try {
        await this.state.transitionPreparation(prep.id, ServerPreparationStatus.FAILED, {
          finishedAt: new Date(),
          summary: 'Préparation interrompue lors du redémarrage du backend. Relancez la préparation.',
          errorMessage: 'Préparation interrompue lors du redémarrage du backend.',
        });
        await this.prisma.server.update({
          where: { id: prep.serverId },
          data: { status: ServerStatus.PREPARATION_FAILED },
        });
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
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${server.id}))`;
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

        // Lock-before-create: also block when any other job (VERIFY,
        // REGISTER_RUNNER, a previous PREPARE_SERVER) is still active, so we
        // never queue a preparation that would immediately be BLOCKED.
        const activeJobs = await tx.serverJob.count({
          where: {
            serverId: server.id,
            status: {
              in: [
                ServerJobStatus.RUNNING,
                ServerJobStatus.PENDING,
                ServerJobStatus.BLOCKED,
              ],
            },
          },
        });
        if (activeJobs > 0) {
          throw new ConflictException(
            'Un job est déjà en cours sur ce serveur. Attendez sa fin ou annulez-le avant de préparer.',
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
              _reinstallOptions: [...(resolved.reinstallOptions ?? [])],
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

    if (!ACTIVE_PREPARATION_STATUSES.includes(preparation.status)) {
      throw new BadRequestException(
        'Cette préparation ne peut plus être annulée.',
      );
    }

    // Abort the running Ansible process immediately
    const controller = this.runningControllers.get(id);
    if (controller) {
      controller.abort();
    }

    // Immediately release the job lock so a new preparation can start without waiting
    const activeJob = await this.prisma.serverJob.findFirst({
      where: {
        serverId: preparation.serverId,
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

    await this.state.transitionPreparation(id, ServerPreparationStatus.CANCELED, {
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
    const timeoutMs = this.resolvePreparationTimeoutMs(roles);
    const abortController = new AbortController();
    this.runningControllers.set(preparationId, abortController);

    try {
      await this.state.transitionPreparation(
        preparationId,
        ServerPreparationStatus.RESOLVING_OPTIONS,
      );
      await this.state.transitionPreparation(
        preparationId,
        ServerPreparationStatus.WAITING_FOR_LOCK,
      );

      const job = await this.prisma.serverJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      await this.jobs.assertJobLock(job);
      await this.state.transitionPreparation(
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

      await this.ssh.withTimeout(
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

      await this.state.markAllRemainingTasks(
        preparationId,
        ServerPreparationTaskStatus.OK,
      );
      await this.state.transitionPreparation(
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
    await this.state.markFailedRunningTasks(preparationId, isTimeout);
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

    // Human-readable error message: strip the JOB_TIMEOUT_ sentinel and use the detail line
    const displayError = isTimeout
      ? (message.split('\n').slice(1).join('\n').trim() || 'Ansible a dépassé le délai configuré.')
      : this.redactSecrets(message);

    const displaySummary = isTimeout
      ? hasSuccessfulTask
        ? 'Timeout: certains rôles ont réussi avant que le délai soit atteint.'
        : 'Timeout: aucun rôle n\'a pu terminer dans le délai imparti.'
      : hasSuccessfulTask
        ? 'Préparation partielle: certains rôles ont réussi avant l\'échec.'
        : 'Préparation échouée.';

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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`prep-log:${preparationId}`}))`;
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
    // Clear, specific human labels per role (shown in the preparation task list).
    const labels: Record<PreparationRoleKey, string> = {
      system_base: 'Système de base (apt + paquets essentiels)',
      docker: 'Docker Engine',
      nginx: 'Nginx',
      nixpacks: 'Nixpacks (builder d’images)',
      nodejs: 'Node.js',
      postgres: 'PostgreSQL',
      redis: 'Redis',
      gitlab_runner: 'GitLab Runner',
      firewall: 'Pare-feu UFW',
      fail2ban: 'Fail2ban',
      ssl: 'Certbot SSL',
      monitoring: 'Agent de monitoring',
      node_exporter: 'Node Exporter',
      cadvisor: 'cAdvisor',
      prometheus: 'Prometheus',
      grafana: 'Grafana',
      alertmanager: 'Alertmanager',
      backup: 'Sauvegardes',
      logrotate: 'Rotation des logs',
      swap: 'Swap',
      security_hardening: 'Durcissement sécurité',
    };
    return labels[role] ?? role.replace(/_/g, ' ');
  }

  private resolvePreparationTimeoutMs(roles: string[] = []): number {
    const fromEnv = Number(this.configService.get<string>('SERVER_PREPARATION_TIMEOUT_MS', '0'));
    if (Number.isFinite(fromEnv) && fromEnv >= 60_000) {
      return Math.floor(fromEnv);
    }
    // Dynamic: heavier roles (package installs) get more time
    const ROLE_BUDGET_MS: Record<string, number> = {
      system_base:      3 * 60_000,   // 3 min — apt update + base packages
      docker:          20 * 60_000,   // 20 min — download + install + start daemon
      nixpacks:        10 * 60_000,   // 10 min
      nodejs:          10 * 60_000,   // 10 min
      postgres:        10 * 60_000,   // 10 min
      redis:            5 * 60_000,   //  5 min
      gitlab_runner:   10 * 60_000,   // 10 min
      nginx:            5 * 60_000,
      ssl:              5 * 60_000,
      firewall:         3 * 60_000,
      fail2ban:         3 * 60_000,
      swap:             2 * 60_000,
      monitoring:       5 * 60_000,
      node_exporter:    5 * 60_000,
      cadvisor:         5 * 60_000,
      prometheus:       8 * 60_000,
      grafana:          8 * 60_000,
      alertmanager:     5 * 60_000,
      backup:           3 * 60_000,
      logrotate:        2 * 60_000,
      security_hardening: 3 * 60_000,
    };
    const DEFAULT_BUDGET_MS = 5 * 60_000;
    const BASE_MS = 5 * 60_000; // 5 min base overhead
    const budget = roles.reduce(
      (sum, r) => sum + (ROLE_BUDGET_MS[r] ?? DEFAULT_BUDGET_MS),
      BASE_MS,
    );
    // Cap at 2 hours, floor at 10 minutes
    return Math.min(Math.max(budget, 10 * 60_000), 120 * 60_000);
  }

  private redactSecrets(value: string): string {
    return redactSecretsUtil(value);
  }
}
