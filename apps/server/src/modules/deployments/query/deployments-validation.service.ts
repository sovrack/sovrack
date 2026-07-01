import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { execFile as execFileCb } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import type { BuildSource } from '../../build/strategies/build-strategy.interface';
import { resolveBuildSource } from '../utils/build-source.util';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { InstalledTool } from '../../../adapters/server-capabilities/server-capabilities.types';
import { SshExecutorService } from '../../../adapters/ssh/ssh-executor.service';
import { ServersCryptoService } from '../../../adapters/ssh/servers-crypto.service';
import { ServerHostKeyService } from '../../../adapters/ssh/server-host-key.service';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';
import { SourceProvidersService } from '../../source-providers/source-providers.service';

const execFile = promisify(execFileCb);

type ToolRequirement = {
  binary: string;
  checkCommand: string;
  label: string;
  role: string;
};

const BUILD_SOURCE_TOOLS: Record<BuildSource, ToolRequirement[]> = {
  NIXPACKS_LOCAL: [
    {
      binary: 'nixpacks',
      checkCommand: 'command -v nixpacks',
      label: 'Nixpacks',
      role: 'nixpacks',
    },
    {
      binary: 'docker',
      checkCommand: 'command -v docker',
      label: 'Docker',
      role: 'docker',
    },
  ],
  NIXPACKS_REGISTRY: [
    {
      binary: 'docker',
      checkCommand: 'command -v docker',
      label: 'Docker',
      role: 'docker',
    },
  ],
  DOCKERFILE_LOCAL: [
    {
      binary: 'docker',
      checkCommand: 'command -v docker',
      label: 'Docker',
      role: 'docker',
    },
  ],
  DOCKERFILE_REGISTRY: [
    {
      binary: 'docker',
      checkCommand: 'command -v docker',
      label: 'Docker',
      role: 'docker',
    },
  ],
  DOCKER_COMPOSE: [
    {
      binary: 'docker',
      checkCommand: 'command -v docker',
      label: 'Docker',
      role: 'docker',
    },
  ],
  STATIC: [],
  EXTERNAL_IMAGE: [
    {
      binary: 'docker',
      checkCommand: 'command -v docker',
      label: 'Docker',
      role: 'docker',
    },
  ],
};

export type DeployValidationResult = {
  ready: boolean;
  prepared: boolean;
  missing: {
    binary: string;
    label: string;
    role: string;
  }[];
  required: {
    binary: string;
    label: string;
    role: string;
  }[];
  serverName: string;
  serverId: string | null;
  buildSource: string;
};

@Injectable()
export class DeploymentsValidationService {
  private readonly logger = new Logger(DeploymentsValidationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: DeploymentsAuthorizationService,
    private readonly serversCryptoService: ServersCryptoService,
    private readonly serverHostKeyService: ServerHostKeyService,
    private readonly ssh: SshExecutorService,
    private readonly gitProvidersService: SourceProvidersService,
  ) {}

  async validate(
    projectId: string,
    environmentId: string,
    buildSource: BuildSource,
    userId: string,
    serviceEnvId?: string,
  ): Promise<DeployValidationResult> {
    const actor = await this.authorizationService.getActor(userId);
    await this.authorizationService.assertCanDeployProject(
      projectId,
      actor.id,
      actor.role,
    );

    // DATABASE services: skip source/repo validation, validate database fields
    if (serviceEnvId) {
      const serviceEnv = await this.prisma.serviceEnvironment.findUnique({
        where: { id: serviceEnvId },
        include: {
          service: {
            select: {
              type: true,
              databaseType: true,
              databaseCredentials: true,
            },
          },
        },
      });
      if (serviceEnv?.service.type === 'DATABASE') {
        const svc = serviceEnv.service;
        if (!svc.databaseType) {
          throw new BadRequestException(
            'databaseType est requis pour un service DATABASE',
          );
        }
        if (svc.databaseCredentials) {
          const creds: unknown =
            typeof svc.databaseCredentials === 'string'
              ? JSON.parse(svc.databaseCredentials)
              : svc.databaseCredentials;
          if (typeof creds === 'object' && creds !== null) {
            const c = creds as Record<string, unknown>;
            if (!c.user || !c.password || !c.dbName) {
              throw new BadRequestException(
                'databaseCredentials doit contenir user, password et dbName',
              );
            }
          }
        }
        return {
          ready: true,
          prepared: true,
          missing: [],
          required: [],
          serverName: '',
          serverId: null,
          buildSource: 'EXTERNAL_IMAGE',
        };
      }
    }

    const environment = await this.prisma.environment.findFirst({
      where: { id: environmentId, projectId },
      include: {
        servers: {
          where: { isActive: true, isVerified: true },
          take: 1,
          select: { id: true, name: true, host: true },
        },
      },
    });

    if (!environment) {
      throw new BadRequestException('Environnement non trouvé pour ce projet');
    }

    // B-3/B-7: Recalculate effective buildSource from DB (single source of truth).
    let effectiveBuildSource = buildSource;
    if (serviceEnvId) {
      const svcEnvForMode = await this.prisma.serviceEnvironment.findUnique({
        where: { id: serviceEnvId },
        select: {
          buildPack: true,
          service: {
            select: { buildPack: true, buildMode: true, sourceType: true },
          },
        },
      });
      if (svcEnvForMode) {
        effectiveBuildSource = resolveBuildSource({
          buildPack:
            svcEnvForMode.buildPack ?? svcEnvForMode.service?.buildPack ?? null,
          buildMode: svcEnvForMode.service?.buildMode ?? 'LOCAL',
          sourceType: svcEnvForMode.service?.sourceType ?? 'GIT',
        });
      }
    }

    const requirements = BUILD_SOURCE_TOOLS[effectiveBuildSource] ?? [];

    // Pre-flight: verify repo is accessible for local build sources.
    // We resolve the serviceId from serviceEnvId so that checkRepoCloneable
    // picks the correct Git provider when multiple services in the same project
    // have different providers configured.
    const localBuildSources: BuildSource[] = [
      'NIXPACKS_LOCAL',
      'DOCKERFILE_LOCAL',
      'DOCKER_COMPOSE',
      'STATIC',
    ];
    if ((localBuildSources as string[]).includes(buildSource)) {
      let resolvedServiceId: string | undefined;
      if (serviceEnvId) {
        const link = await this.prisma.serviceEnvironment.findUnique({
          where: { id: serviceEnvId },
          select: { serviceId: true },
        });
        resolvedServiceId = link?.serviceId ?? undefined;
      }
      await this.checkRepoCloneable(projectId, resolvedServiceId);
    }

    if (requirements.length === 0) {
      return {
        ready: true,
        prepared: true,
        missing: [],
        required: [],
        serverName: environment.servers[0]?.name ?? '',
        serverId: environment.servers[0]?.id ?? null,
        buildSource: effectiveBuildSource,
      };
    }

    const server = environment.servers[0] ?? null;

    if (!server) {
      const required = requirements.map((r) => ({
        binary: r.binary,
        label: r.label,
        role: r.role,
      }));
      return {
        ready: false,
        prepared: false,
        missing: required,
        required,
        serverName: '',
        serverId: null,
        buildSource: effectiveBuildSource,
      };
    }

    // Verify the server has been fully prepared (tools installed) and check
    // which of the required tools are confirmed installed vs missing.
    const [confirmedTools, latestPrep] = await Promise.all([
      this.getConfirmedToolsFromDb(server.id),
      this.getLatestSuccessfulPreparation(server.id),
    ]);

    // If the server has never been successfully prepared, all tools are missing.
    if (!latestPrep) {
      const required = requirements.map((r) => ({
        binary: r.binary,
        label: r.label,
        role: r.role,
      }));
      return {
        ready: false,
        prepared: false,
        missing: required,
        required,
        serverName: server.name,
        serverId: server.id,
        buildSource: effectiveBuildSource,
      };
    }

    const missing = requirements
      .filter((r) => !confirmedTools.has(r.binary))
      .map((r) => ({ binary: r.binary, label: r.label, role: r.role }));

    return {
      ready: missing.length === 0,
      prepared: true,
      missing,
      required: requirements.map((r) => ({
        binary: r.binary,
        label: r.label,
        role: r.role,
      })),
      serverName: server.name,
      serverId: server.id,
      buildSource: effectiveBuildSource,
    };
  }

  private async getConfirmedToolsFromDb(
    serverId: string,
  ): Promise<Set<string>> {
    const confirmed = new Set<string>();

    // Check Server.installedTools JSON — single source of truth for all tools
    // including docker (written by the detection + preparation workflows).
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { installedTools: true },
    });
    const installedTools =
      (server?.installedTools as InstalledTool[] | null) ?? [];
    for (const tool of installedTools) {
      if (tool.status === 'INSTALLED') {
        confirmed.add(tool.toolKey);
      }
    }

    return confirmed;
  }

  private async checkRepoCloneable(
    projectId: string,
    serviceId?: string,
  ): Promise<void> {
    let askpassPath: string | null = null;
    try {
      // Invariant : provider lié au SERVICE — résolution par service si dispo.
      const provider = serviceId
        ? await this.gitProvidersService.forService(serviceId)
        : await this.gitProvidersService.forProject(projectId);
      const creds = await provider.resolveGitCredentials(projectId, serviceId);

      let host = '';
      try {
        host = new URL(creds.repoUrl).host;
      } catch {
        host = '';
      }
      const authUser = host.includes('github') ? 'x-access-token' : 'oauth2';

      // Use GIT_ASKPASS with env-var-backed script to avoid leaking the token
      // on the CLI (visible via ps) or embedded in a temp file.
      askpassPath = join(
        tmpdir(),
        `git-askpass-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      );
      await writeFile(
        askpassPath,
        [
          '#!/bin/sh',
          'case "$1" in',
          '  *Username*) echo "$GIT_ASKPASS_USER" ;;',
          '  *Password*) echo "$GIT_ASKPASS_PASS" ;;',
          'esac',
        ].join('\n'),
        { mode: 0o500 },
      );

      const { stderr } = await execFile(
        'git',
        ['ls-remote', '--heads', creds.repoUrl],
        {
          timeout: 15_000,
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: askpassPath,
            GIT_ASKPASS_USER: authUser,
            GIT_ASKPASS_PASS: creds.token,
          },
        },
      );

      if (stderr && stderr.includes('fatal')) {
        throw new Error(stderr);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const safe = raw.split('\n')[0];
      this.logger.warn(
        `[validate] Repo not cloneable for project ${projectId}: ${safe}`,
      );
      throw new BadRequestException(
        `Dépôt Git inaccessible. Vérifiez que le token est valide et que le chemin du dépôt est correct : ${safe}`,
      );
    } finally {
      if (askpassPath) {
        await unlink(askpassPath).catch(() => {});
      }
    }
  }

  /**
   * Returns the latest successful ServerPreparation for a server, or null.
   * Used to ensure a server has been fully prepared (tools installed) before
   * allowing a deployment — not just SSH-validated (isVerified).
   */
  private async getLatestSuccessfulPreparation(
    serverId: string,
  ): Promise<{ id: string; finishedAt: Date | null } | null> {
    return this.prisma.serverRun.findFirst({
      where: {
        serverId,
        kind: 'PREPARATION' as const,
        status: 'SUCCEEDED' as const,
      },
      orderBy: { finishedAt: 'desc' },
      select: { id: true, finishedAt: true },
    });
  }
}
