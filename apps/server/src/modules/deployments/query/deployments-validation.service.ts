import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { exec as execCb } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import type { BuildSource } from '../../build/strategies/build-strategy.interface';
import { PrismaService } from '../../../core/database/prisma.service';
import type { InstalledTool } from '../../infrastructure/servers/shared/server-capabilities.types';
import {
  SshExecutorService,
  type SshConnection,
} from '../../../core/ssh/ssh-executor.service';
import {
  ServerHostKeyService,
  ServersCryptoService,
} from '../../infrastructure/servers/services';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';
import { SourceProvidersService } from '../../source-providers/source-providers.service';

const exec = promisify(execCb);

type ToolRequirement = {
  binary: string;
  checkCommand: string;
  label: string;
  role: string;
};

const BUILD_SOURCE_TOOLS: Record<BuildSource, ToolRequirement[]> = {
  NIXPACKS_LOCAL: [
    { binary: 'nixpacks', checkCommand: 'command -v nixpacks', label: 'Nixpacks', role: 'nixpacks' },
    { binary: 'docker',   checkCommand: 'command -v docker',   label: 'Docker',   role: 'docker' },
  ],
  NIXPACKS_REGISTRY: [
    { binary: 'docker',   checkCommand: 'command -v docker',   label: 'Docker',   role: 'docker' },
  ],
  DOCKERFILE_LOCAL: [
    { binary: 'docker',   checkCommand: 'command -v docker',   label: 'Docker',   role: 'docker' },
  ],
  DOCKERFILE_REGISTRY: [
    { binary: 'docker',   checkCommand: 'command -v docker',   label: 'Docker',   role: 'docker' },
  ],
  DOCKER_COMPOSE: [
    { binary: 'docker',   checkCommand: 'command -v docker',   label: 'Docker',   role: 'docker' },
  ],
  STATIC: [],
  EXTERNAL_IMAGE: [
    { binary: 'docker',   checkCommand: 'command -v docker',   label: 'Docker',   role: 'docker' },
  ],
};

export type DeployValidationResult = {
  ready: boolean;
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
            select: { type: true, databaseType: true, databaseCredentials: true },
          },
        },
      });
      if (serviceEnv?.service.type === 'DATABASE') {
        const svc = serviceEnv.service;
        if (!svc.databaseType) {
          throw new BadRequestException('databaseType est requis pour un service DATABASE');
        }
        if (svc.databaseCredentials) {
          const creds = typeof svc.databaseCredentials === 'string'
            ? JSON.parse(svc.databaseCredentials)
            : svc.databaseCredentials;
          if (typeof creds === 'object' && creds !== null) {
            const c = creds as Record<string, unknown>;
            if (!c.user || !c.password || !c.dbName) {
              throw new BadRequestException('databaseCredentials doit contenir user, password et dbName');
            }
          }
        }
        return {
          ready: true,
          missing: [],
          required: [],
          serverName: '',
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

    const requirements = BUILD_SOURCE_TOOLS[buildSource] ?? [];

    // Pre-flight: verify repo is accessible for local build sources
    const localBuildSources: BuildSource[] = ['NIXPACKS_LOCAL', 'DOCKERFILE_LOCAL', 'DOCKER_COMPOSE', 'STATIC'];
    if ((localBuildSources as string[]).includes(buildSource)) {
      await this.checkRepoCloneable(projectId, undefined);
    }

    if (requirements.length === 0) {
      return {
        ready: true,
        missing: [],
        required: [],
        serverName: '',
        buildSource,
      };
    }

    return {
      ready: true,
      missing: [],
      required: requirements.map((r) => ({
        binary: r.binary,
        label: r.label,
        role: r.role,
      })),
      serverName: '',
      buildSource,
    };
  }

  private async getConfirmedToolsFromDb(
    serverId: string,
    hasDocker: boolean,
  ): Promise<Set<string>> {
    const confirmed = new Set<string>();

    // The hasDocker flag is updated by detection and after successful preparation
    if (hasDocker) {
      confirmed.add('docker');
    }

    // Check Server.installedTools JSON for other tools (e.g. nixpacks).
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { installedTools: true },
    });
    const installedTools = (server?.installedTools as InstalledTool[] | null) ?? [];
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
      askpassPath = join(tmpdir(), `git-askpass-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      await writeFile(askpassPath, [
        '#!/bin/sh',
        'case "$1" in',
        '  *Username*) echo "$GIT_ASKPASS_USER" ;;',
        '  *Password*) echo "$GIT_ASKPASS_PASS" ;;',
        'esac',
      ].join('\n'), { mode: 0o500 });

      const { stderr } = await exec(`git ls-remote --heads "${creds.repoUrl}"`, {
        timeout: 15_000,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: askpassPath,
          GIT_ASKPASS_USER: authUser,
          GIT_ASKPASS_PASS: creds.token,
        },
      });

      if (stderr && stderr.includes('fatal')) {
        throw new Error(stderr);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const safe = raw.split('\n')[0];
      this.logger.warn(`[validate] Repo not cloneable for project ${projectId}: ${safe}`);
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
    return this.prisma.serverPreparation.findFirst({
      where: {
        serverId,
        status: 'SUCCEEDED' as const,
      },
      orderBy: { finishedAt: 'desc' },
      select: { id: true, finishedAt: true },
    });
  }
}
