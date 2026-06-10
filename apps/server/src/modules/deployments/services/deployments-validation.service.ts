import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import type { BuildSource } from '../../build/strategies/build-strategy.interface';
import { PrismaService } from '../../../core/database/prisma.service';
import {
  SshExecutorService,
  type SshConnection,
} from '../../../core/ssh/ssh-executor.service';
import {
  ServerHostKeyService,
  ServersCryptoService,
} from '../../servers/services';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';
import { GitProvidersService } from '../../git-providers/git-providers.service';

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
    private readonly gitProvidersService: GitProvidersService,
  ) {}

  async validate(
    projectId: string,
    environmentId: string,
    buildSource: BuildSource,
    userId: string,
  ): Promise<DeployValidationResult> {
    const actor = await this.authorizationService.getActor(userId);
    await this.authorizationService.assertCanDeployProject(
      projectId,
      actor.id,
      actor.role,
    );

    const environment = await this.prisma.environment.findFirst({
      where: { id: environmentId, projectId },
      include: {
        server: true,
        serviceTargets: { include: { server: true } },
      },
    });

    if (!environment) {
      throw new BadRequestException('Environnement non trouvé pour ce projet');
    }

    const server = environment.server;
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
        serverName: `${server.username}@${server.host}:${server.port}`,
        buildSource,
      };
    }

    if (!server.isVerified) {
      return {
        ready: false,
        missing: requirements.map((r) => ({
          binary: r.binary,
          label: r.label,
          role: r.role,
        })),
        required: requirements.map((r) => ({
          binary: r.binary,
          label: r.label,
          role: r.role,
        })),
        serverName: `${server.username}@${server.host}:${server.port}`,
        buildSource,
      };
    }

    // DB-first: known tool state. If every required tool is already confirmed
    // INSTALLED in the DB, the server is ready for this build — regardless of
    // any preparation record. (A confirmed server is never blocked below.)
    const confirmedInDb = await this.getConfirmedToolsFromDb(server.id, server.hasDocker);
    const needsSshCheck = requirements.filter((r) => !confirmedInDb.has(r.binary));

    // 2nd barrier: only when some tools are NOT confirmed in DB. The server
    // must then have been prepared (the preparation installs Docker/Nixpacks)
    // before we fall back to a live SSH probe. This never blocks a server whose
    // tools are already confirmed installed (PARTIAL/absent prep is fine then).
    if (needsSshCheck.length > 0) {
      const lastPrep = await this.getLatestSuccessfulPreparation(server.id);
      if (!lastPrep) {
        return {
          ready: false,
          missing: needsSshCheck.map((r) => ({
            binary: r.binary,
            label: r.label,
            role: r.role,
          })),
          required: requirements.map((r) => ({
            binary: r.binary,
            label: r.label,
            role: r.role,
          })),
          serverName: `${server.username}@${server.host}:${server.port}`,
          buildSource,
        };
      }
    }

    if (needsSshCheck.length === 0) {
      // All tools confirmed from DB records — skip SSH entirely
      this.logger.debug(
        `[validate] Server ${server.id} tools confirmed from DB, skipping SSH`,
      );
      return {
        ready: true,
        missing: [],
        required: requirements.map((r) => ({
          binary: r.binary,
          label: r.label,
          role: r.role,
        })),
        serverName: `${server.username}@${server.host}:${server.port}`,
        buildSource,
      };
    }

    // SSH fallback: only check tools not confirmed in DB
    const decryptedSshKey = this.serversCryptoService.decrypt(server.sshKey);
    const pinnedHost = await this.serverHostKeyService.resolveForConnection(
      server,
      { allowTrustOnFirstUse: false },
    );

    let conn: SshConnection | null = null;
    try {
      conn = await this.ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey: decryptedSshKey,
        expectedHostKey: pinnedHost.keyBase64,
        readyTimeoutMs: 10_000,
      });

      if (!conn) {
        return {
          ready: false,
          missing: requirements.map((r) => ({
            binary: r.binary,
            label: r.label,
            role: r.role,
          })),
          required: requirements.map((r) => ({
            binary: r.binary,
            label: r.label,
            role: r.role,
          })),
          serverName: `${server.username}@${server.host}:${server.port}`,
          buildSource,
        };
      }

      const sshResults = await Promise.all(
        needsSshCheck.map(async (req) => {
          try {
            const result = await this.ssh.exec(conn!, req.checkCommand);
            return { ...req, found: result.code === 0 };
          } catch {
            return { ...req, found: false };
          }
        }),
      );

      // Merge: DB-confirmed tools are found, SSH results for the rest
      const allResults = requirements.map((req) => {
        if (confirmedInDb.has(req.binary)) return { ...req, found: true };
        const sshResult = sshResults.find((r) => r.binary === req.binary);
        return { ...req, found: sshResult?.found ?? false };
      });

      const missing = allResults
        .filter((r) => !r.found)
        .map((r) => ({ binary: r.binary, label: r.label, role: r.role }));

      return {
        ready: missing.length === 0,
        missing,
        required: requirements.map((r) => ({
          binary: r.binary,
          label: r.label,
          role: r.role,
        })),
        serverName: `${server.username}@${server.host}:${server.port}`,
        buildSource,
      };
    } finally {
      if (conn) await conn.dispose();
    }
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

    // Check ServerInstalledTool records for other tools (e.g. nixpacks)
    const installedTools = await this.prisma.serverInstalledTool.findMany({
      where: {
        serverId,
        status: 'INSTALLED' as const,
      },
      select: { toolKey: true },
    });

    for (const tool of installedTools) {
      confirmed.add(tool.toolKey);
    }

    return confirmed;
  }

  private async checkRepoCloneable(
    projectId: string,
    serviceId?: string,
  ): Promise<void> {
    let token = '';
    try {
      const provider = await this.gitProvidersService.forProject(projectId);
      const creds = await provider.resolveGitCredentials(projectId, serviceId);
      token = creds.token;

      // Provider-agnostic auth username: GitHub PATs/app-tokens use
      // "x-access-token", GitLab uses "oauth2". The host decides.
      let host = '';
      try {
        host = new URL(creds.repoUrl).host;
      } catch {
        host = '';
      }
      const authUser = host.includes('github') ? 'x-access-token' : 'oauth2';
      const authUrl = creds.repoUrl.replace('://', `://${authUser}:${token}@`);

      const { stderr } = await exec(`git ls-remote --heads "${authUrl}"`, {
        timeout: 15_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });

      if (stderr && stderr.includes('fatal')) {
        throw new Error(stderr);
      }
    } catch (err) {
      // Never leak the token into logs or the API error.
      const raw = err instanceof Error ? err.message : String(err);
      const safe = (token ? raw.split(token).join('***') : raw).split('\n')[0];
      this.logger.warn(`[validate] Repo not cloneable for project ${projectId}: ${safe}`);
      throw new BadRequestException(
        `Dépôt Git inaccessible. Vérifiez que le token est valide et que le chemin du dépôt est correct : ${safe}`,
      );
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
