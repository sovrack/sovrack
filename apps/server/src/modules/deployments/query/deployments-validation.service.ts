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
import { DeploymentPreflightService } from '../core/deployment-preflight.service';
import { buildSafeSpawnEnv } from '../../../shared/utils/safe-spawn-env.util';

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
  /**
   * Set when serviceEnvId is provided and DeploymentPreflightService rejects
   * the deploy (server state, build content, secrets format, registry
   * credentials…) — the exact reason a real POST /deployments would fail.
   * Independent of missing/required, which report tool-installation status.
   */
  reason?: string;
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
    private readonly preflight: DeploymentPreflightService,
  ) {}

  async validate(
    projectId: string,
    environmentId: string,
    buildSource: BuildSource,
    userId: string,
    serviceEnvId?: string,
    expectedWorkspaceId?: string,
  ): Promise<DeployValidationResult> {
    const actor = await this.authorizationService.getActor(userId);
    if (expectedWorkspaceId) {
      await this.authorizationService.assertCanDeployProject(
        projectId,
        actor.id,
        actor.role,
        expectedWorkspaceId,
      );
    } else {
      await this.authorizationService.assertCanDeployProject(
        projectId,
        actor.id,
        actor.role,
      );
    }

    // Garde de pré-vol centralisée (voir AUDIT_VALIDATION_DEPLOIEMENT.md) —
    // les mêmes 8 vérifications bloquantes que POST /deployments, mais
    // capturées ici en rapport informatif plutôt qu'en erreur HTTP : cet
    // endpoint reste consultatif (le frontend l'appelle avant de proposer le
    // bouton "Deploy", il ne doit jamais lui-même faire échouer la requête).
    // Seulement possible quand serviceEnvId est fourni — assertDeployable a
    // besoin d'une ligne ServiceEnvironment concrète (service+environnement+
    // secrets) ; l'appel générique projet+environnement (sans service choisi
    // encore) reste couvert par la logique d'outillage ci-dessous.
    let preflightReason: string | undefined;
    let isDatabaseService = false;
    if (serviceEnvId) {
      const serviceEnv = await this.prisma.serviceEnvironment.findUnique({
        where: { id: serviceEnvId },
        select: { service: { select: { type: true } } },
      });
      isDatabaseService = serviceEnv?.service.type === 'DATABASE';

      try {
        await this.preflight.assertDeployable({ serviceEnvId });
      } catch (err) {
        preflightReason =
          err instanceof Error ? err.message : 'Pré-vol du déploiement échoué';
      }

      // Un service DATABASE n'a ni build ni dépôt Git — assertDeployable a
      // déjà validé serveur/circuit-breaker/databaseType/databaseCredentials/
      // secretsEnv (même raccourci qu'avant, désormais centralisé). Rien à
      // ajouter côté outillage (image vendor fixe, pas de binaire à installer).
      if (isDatabaseService) {
        return {
          ready: preflightReason === undefined,
          prepared: preflightReason === undefined,
          missing: [],
          required: [],
          serverName: '',
          serverId: null,
          buildSource: 'EXTERNAL_IMAGE',
          reason: preflightReason,
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
    // When serviceEnvId is known, assertDeployable() above already ran this
    // exact check (with the branch-aware fix — see checkRepoCloneable) as
    // part of the centralized 8-point guard; running it again here would
    // just double the outbound git call for the same answer. Only the
    // project-level fallback (no serviceEnvId yet — nothing concrete to pass
    // to assertDeployable) still needs its own check.
    const localBuildSources: BuildSource[] = [
      'NIXPACKS_LOCAL',
      'DOCKERFILE_LOCAL',
      'DOCKER_COMPOSE',
      'STATIC',
    ];
    if (
      !serviceEnvId &&
      (localBuildSources as string[]).includes(buildSource)
    ) {
      await this.checkRepoCloneable(projectId);
    }

    if (requirements.length === 0) {
      return {
        ready: preflightReason === undefined,
        prepared: true,
        missing: [],
        required: [],
        serverName: environment.servers[0]?.name ?? '',
        serverId: environment.servers[0]?.id ?? null,
        buildSource: effectiveBuildSource,
        reason: preflightReason,
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
        reason: preflightReason,
      };
    }

    // Verify the server has been fully set up (tools installed) and check
    // which of the required tools are confirmed installed vs missing.
    const [confirmedTools, latestSetup] = await Promise.all([
      this.getConfirmedToolsFromDb(server.id),
      this.getLatestSuccessfulSetup(server.id),
    ]);

    // If the server has never been successfully set up, all tools are missing.
    if (!latestSetup) {
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
        reason: preflightReason,
      };
    }

    const missing = requirements
      .filter((r) => !confirmedTools.has(r.binary))
      .map((r) => ({ binary: r.binary, label: r.label, role: r.role }));

    return {
      ready: missing.length === 0 && preflightReason === undefined,
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
      reason: preflightReason,
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

  /**
   * Fallback réservé au cas générique projet+environnement SANS serviceEnvId
   * (le frontend l'utilise avant que l'utilisateur ait choisi un service
   * précis — voir deploy-dialog.tsx). Dès qu'un serviceEnvId est connu,
   * assertDeployable() couvre ce même point (accessibilité + BRANCHE précise,
   * voir checkRepoCloneable dans utils/repo-cloneable.util.ts) et ce fallback
   * n'est plus appelé. Ce fallback ne vérifie QUE l'accessibilité du dépôt
   * (pas de branche précise à comparer sans service choisi) — comportement
   * historique inchangé pour ce cas précis.
   */
  private async checkRepoCloneable(projectId: string): Promise<void> {
    let askpassPath: string | null = null;
    try {
      const provider = await this.gitProvidersService.forProject(projectId);
      const creds = await provider.resolveGitCredentials(projectId, undefined);

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
          env: buildSafeSpawnEnv({
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: askpassPath,
            GIT_ASKPASS_USER: authUser,
            GIT_ASKPASS_PASS: creds.token,
          }),
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
   * Returns the latest successful ServerSetup for a server, or null.
   * Used to ensure a server has been fully prepared (tools installed) before
   * allowing a deployment — not just SSH-validated (isVerified).
   */
  private async getLatestSuccessfulSetup(
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
