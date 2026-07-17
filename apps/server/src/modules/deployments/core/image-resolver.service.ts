import { Inject, Injectable } from '@nestjs/common';
import { Server } from '@prisma/client';
import type { IDockerRuntime } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DOCKER_RUNTIME } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import {
  LocalBuildService,
  type LocalBuildParams,
} from './local-build.service';
import { RegistryAuthService } from './registry-auth.service';
import { DeploymentLogEmitter } from './deployment-log-emitter.service';
import { ok, err, type Result } from '../../../shared/types/result.type';

/**
 * Résolution et préparation de l'image d'un déploiement.
 *
 * Responsabilité unique : transformer un déploiement en une image:tag prête
 * sur le serveur cible — soit en la construisant localement (build sur le VPS
 * via SSH), soit en la pullant depuis un registre (avec auth si privé). Calcule
 * aussi le nom canonique de l'image et son digest.
 *
 * Extrait de DockerDeployExecutorService (qui orchestrait tout) pour isoler la
 * logique d'image de l'orchestration du cycle de vie des conteneurs.
 */
@Injectable()
export class ImageResolverService {
  constructor(
    @Inject(DOCKER_RUNTIME) private readonly docker: IDockerRuntime,
    private readonly registryAuth: RegistryAuthService,
    private readonly localBuild: LocalBuildService,
    private readonly logEmitter: DeploymentLogEmitter,
  ) {}

  /**
   * Détermine la référence d'image à déployer, par ordre de priorité :
   * override explicite > image déjà fixée > build local (tag unique par
   * déploiement) > image registre (par sha ou par branche).
   */
  resolveImageRef(
    deployment: {
      id: string;
      build?: {
        isLocalBuild?: boolean | null;
        imageSha?: string | null;
        buildPack?: string | null;
      } | null;
      dockerImage?: string | null;
      service?: { id?: string | null; name?: string | null } | null;
      project: { id: string; name: string };
      branch: string;
    },
    overrideImage?: string,
    _serverId?: string,
  ): string {
    if (overrideImage) return overrideImage;
    if (deployment.dockerImage) return deployment.dockerImage;

    // Local builds produce an image tagged only on the server — no registry.
    // UNIQUE tag per deployment (not per branch) so each deployment's image
    // survives the next build (the old one is no longer overwritten/dangling)
    // → rollback can reuse the EXACT previous image. Old images are bounded by
    // a keep-last-N cleanup in LocalBuildService.
    if (deployment.build?.isLocalBuild) {
      const safeName = (deployment.service?.name ?? deployment.project.name)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-');
      const safeProject = deployment.project.name
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-');
      return `local/${safeProject}-${safeName}:${deployment.id.slice(0, 8)}`;
    }

    if (deployment.build?.imageSha) {
      return `deployautomation/${deployment.project.id}:${deployment.build.imageSha}`;
    }
    return `deployautomation/${deployment.project.id}:${deployment.branch || 'latest'}`;
  }

  /** Build the image on the server (local build) or pull it from a registry. */
  async buildOrPullImage(
    deployment: LocalBuildParams['deployment'],
    imageRef: string,
    isLocalBuild: boolean,
    server: Server,
    serverId: string,
    buildArgs: string[],
    buildSecrets: string[],
    pinnedImage: boolean,
  ): Promise<string> {
    if (isLocalBuild) {
      // Rollback / redeploy of a PINNED local image: if it already exists on the
      // server (unique per-deploy tag or pinned digest), reuse it instead of
      // rebuilding from source — guarantees the same content (the branch may
      // have moved since) and is instant. A fresh deploy (not pinned) always
      // rebuilds.
      const alreadyBuilt =
        pinnedImage &&
        (await this.docker
          .inspectImage(serverId, imageRef)
          .then(() => true)
          .catch(() => false));
      if (alreadyBuilt) {
        this.logEmitter.emit(
          deployment.id,
          `Image locale réutilisée (rollback/redeploy) : ${imageRef}`,
          'info',
        );
        return `Image locale réutilisée : ${imageRef}\n`;
      }
      // Build the image directly on the server via SSH.
      return this.localBuild.run({
        deployment,
        imageTag: imageRef,
        server,
        buildArgs,
        buildSecrets,
        onLog: (m, l) => this.logEmitter.emit(deployment.id, m, l ?? 'info'),
      });
    }
    this.logEmitter.emit(
      deployment.id,
      `Pull de l'image ${imageRef}...`,
      'info',
    );
    // Images privées : on résout les identifiants du registre dont le host
    // correspond à l'image (Docker Hub / GitLab / GHCR…) et on les passe au
    // pull. Sans registre correspondant → pull anonyme (images publiques) :
    // resolveAuthForImage renvoie undefined pour ce cas légitime, il n'y a
    // rien à catch. Un registre CONNU mais mal configuré lève désormais une
    // BadRequestException explicite (voir RegistryAuthService) — ne plus
    // l'avaler en pull anonyme silencieux (le pré-vol l'attrape déjà avant
    // création du déploiement ; ce garde-fou reste actif si ce point est
    // atteint malgré tout, en défense en profondeur).
    const pullAuth = await this.registryAuth.resolveAuthForImage(imageRef);
    await this.docker.pullImage(serverId, imageRef, pullAuth);
    return `Image pullée : ${imageRef}${pullAuth ? ' (authentifié)' : ''}\n`;
  }

  /**
   * Resolve the image's content digest (RepoDigest, else the image Id).
   *
   * Retourne un {@link Result} plutôt que `string | null` : en cas d'échec la
   * RAISON (image absente, daemon injoignable…) n'est plus silencieusement
   * perdue — le caller peut la logguer tout en gardant son fallback. Exemple
   * d'application ciblée du pattern Result aux erreurs prévisibles.
   */
  async resolveImageDigest(
    serverId: string,
    imageRef: string,
  ): Promise<Result<string, string>> {
    try {
      const info = await this.docker.inspectImage(serverId, imageRef);
      const digest = info?.RepoDigests?.[0];
      if (digest) {
        const parts = digest.split('@');
        return parts[1] ? ok(parts[1]) : err('digest sans sha (@) exploitable');
      }
      return info?.Id ? ok(info.Id) : err('image sans RepoDigest ni Id');
    } catch (e) {
      return err(e instanceof Error ? e.message : 'inspectImage a échoué');
    }
  }
}
