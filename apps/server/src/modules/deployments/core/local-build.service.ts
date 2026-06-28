import { BadRequestException, Injectable } from '@nestjs/common';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { SshExecutorService } from '../../../adapters/ssh/ssh-executor.service';
import { ServersCryptoService } from '../../../adapters/ssh/servers-crypto.service';
import { ServerHostKeyService } from '../../../adapters/ssh/server-host-key.service';
import { buildAuthenticatedCloneUrl } from '../../../shared/utils/clone-url.util';
import {
  isNamespacedRepoPath,
  normalizeRepoPath,
} from '../../../shared/utils/repo-path.util';

export type BuildLogLevel = 'info' | 'error';

export type LocalBuildParams = {
  deployment: {
    id: string;
    branch: string;
    service?: {
      repoPath?: string | null;
      rootDir?: string | null;
      dockerfile?: string | null;
      buildPack?: string | null;
      provider?: { providerUrl: string; adminToken?: string | null } | null;
    } | null;
    build?: { buildPack?: string | null } | null;
  };
  imageTag: string;
  server: { host: string; port: number; username: string; sshKey: string };
  /** Variables NON-secrètes → build-args (Dockerfile) / --env (Nixpacks). */
  buildArgs?: string[];
  /**
   * Secrets ("KEY=value") montés au build via BuildKit `--secret` (Dockerfile
   * uniquement). Jamais en --build-arg : ne fuitent PAS dans les couches/historique
   * de l'image. Le Dockerfile les lit via `RUN --mount=type=secret,id=KEY`.
   */
  buildSecrets?: string[];
  /** Émetteur de logs live (le gateway reste dans l'executor). */
  onLog: (message: string, level?: BuildLogLevel) => void;
};

/** Hard caps so a stalled clone/build never blocks the SSH exec forever. */
const CLONE_TIMEOUT_S = 600; // 10 min
const BUILD_TIMEOUT_S = 1800; // 30 min

/**
 * Phase BUILD LOCAL du déploiement (sur le VPS via SSH) : git clone +
 * docker/nixpacks/static build. Extrait de DockerDeployExecutorService pour
 * isoler cette phase (testable, responsabilité unique). Comportement identique.
 */
@Injectable()
export class LocalBuildService {
  constructor(
    private readonly ssh: SshExecutorService,
    private readonly crypto: CryptoService,
    private readonly serversCrypto: ServersCryptoService,
    private readonly serverHostKeys: ServerHostKeyService,
  ) {}

  async run(params: LocalBuildParams): Promise<string> {
    const { deployment, imageTag, server, onLog } = params;
    const buildArgs = params.buildArgs ?? [];
    const svc = deployment.service;
    if (!svc?.repoPath) {
      throw new BadRequestException(
        'Local build requires service.repoPath to be set',
      );
    }

    const buildPack = (
      svc.buildPack ??
      deployment.build?.buildPack ??
      'DOCKERFILE'
    )
      .toString()
      .toUpperCase();
    const providerUrl = svc.provider?.providerUrl ?? '';
    const token = svc.provider?.adminToken
      ? this.crypto.decrypt(svc.provider.adminToken)
      : '';
    const repoPath = normalizeRepoPath(svc.repoPath);
    if (!isNamespacedRepoPath(repoPath)) {
      throw new BadRequestException(
        `Invalid repository path "${repoPath}": expected "namespace/project" ` +
          `(e.g. "my-group/my-repo"). The group/owner segment is missing, so ` +
          `the clone URL would point to a non-existent namespace.`,
      );
    }
    const cloneUrl = buildAuthenticatedCloneUrl(providerUrl, repoPath, token);
    const branch = deployment.branch || 'main';
    const rootDir = svc.rootDir?.replace(/^\//, '') ?? '.';
    const workDir = `/tmp/build-${deployment.id.slice(0, 8)}`;
    // Secrets live OUTSIDE the build context (never sent to the daemon / image).
    const secretsDir = `/tmp/secrets-${deployment.id.slice(0, 8)}`;
    const buildSecrets = params.buildSecrets ?? [];

    let logs = '';
    onLog(`[LOCAL BUILD] Cloning ${repoPath} branch ${branch}...`, 'info');

    const pinnedHost = await this.serverHostKeys.resolveForConnection(server, {
      allowTrustOnFirstUse: false,
    });
    const conn = await this.ssh.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      privateKey: this.serversCrypto.decrypt(server.sshKey),
      expectedHostKey: pinnedHost.keyBase64,
    });

    try {
      const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

      // --recurse-submodules: repos vendoring submodules build correctly.
      // timeout: a stalled clone fails fast instead of hanging the deployment.
      await this.ssh.execOrThrow(
        conn,
        `rm -rf ${q(workDir)} && timeout ${CLONE_TIMEOUT_S} git clone --depth 1 --recurse-submodules --shallow-submodules -b ${q(branch)} ${q(cloneUrl)} ${q(workDir)}`,
        'Git clone failed',
      );
      logs += `[LOCAL BUILD] Cloned ${repoPath}@${branch}\n`;
      onLog(`[LOCAL BUILD] Clone OK`, 'info');

      const buildCtx = rootDir === '.' ? workDir : `${workDir}/${rootDir}`;

      // Write a minimal .dockerignore if the repo lacks one, so the build
      // context never ships .git or .env (secret leak into the image) and the
      // upload stays small. Best-effort, never overwrites a user-provided file.
      await this.ssh.exec(
        conn,
        `cd ${q(buildCtx)} && [ -f .dockerignore ] || printf '%s\\n' '.git' '.env' '.env.*' '*.log' > .dockerignore`,
      );

      const dockerBuildArgs = buildArgs
        .map((a) => `--build-arg ${q(a)}`)
        .join(' ');
      const nixpacksEnvArgs = buildArgs.map((a) => `--env ${q(a)}`).join(' ');

      if (buildPack === 'NIXPACKS') {
        await this.ssh.execOrThrow(
          conn,
          `cd ${q(buildCtx)} && timeout ${BUILD_TIMEOUT_S} nixpacks build . ${nixpacksEnvArgs} --name ${q(imageTag)}`,
          'Nixpacks build failed',
        );
        logs += `[LOCAL BUILD] Nixpacks build OK → ${imageTag}\n`;
      } else if (buildPack === 'STATIC') {
        const nginxConf = `server { listen 80; root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; }`;
        await this.ssh.execOrThrow(
          conn,
          `cd ${q(buildCtx)} && printf 'FROM nginx:alpine\\nCOPY . /usr/share/nginx/html\\n' > Dockerfile.static && ` +
            `printf '%s' ${q(nginxConf)} > nginx.conf.tmp && ` +
            `DOCKER_BUILDKIT=1 timeout ${BUILD_TIMEOUT_S} docker build --cache-from ${q(imageTag)} --build-arg BUILDKIT_INLINE_CACHE=1 -f Dockerfile.static -t ${q(imageTag)} .`,
          'Static build failed',
        );
        logs += `[LOCAL BUILD] Static site packaged → ${imageTag}\n`;
      } else {
        const dockerfilePath = svc.dockerfile
          ? 'Dockerfile.custom'
          : 'Dockerfile';
        if (svc.dockerfile) {
          await this.ssh.execOrThrow(
            conn,
            `printf '%s' ${q(svc.dockerfile)} > ${q(`${buildCtx}/Dockerfile.custom`)}`,
            'Failed to write custom Dockerfile',
          );
        }

        // Build secrets via BuildKit `--secret` — written to a dir OUTSIDE the
        // build context (never shipped to the daemon nor baked into image layers,
        // unlike --build-arg). The Dockerfile reads them with
        // `RUN --mount=type=secret,id=KEY` (available at /run/secrets/KEY).
        let secretFlags = '';
        if (buildSecrets.length > 0) {
          await this.ssh.exec(
            conn,
            `mkdir -p ${q(secretsDir)} && chmod 700 ${q(secretsDir)}`,
          );
          const ids: string[] = [];
          for (const entry of buildSecrets) {
            const eq = entry.indexOf('=');
            if (eq <= 0) continue;
            const key = entry.slice(0, eq);
            const value = entry.slice(eq + 1);
            // Valid secret id / filename only.
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
            const file = `${secretsDir}/${key}`;
            await this.ssh.execOrThrow(
              conn,
              `printf '%s' ${q(value)} > ${q(file)} && chmod 600 ${q(file)}`,
              'Failed to write build secret',
            );
            ids.push(`--secret id=${key},src=${q(file)}`);
          }
          secretFlags = ids.length > 0 ? ` ${ids.join(' ')}` : '';
          if (ids.length > 0)
            logs += `[LOCAL BUILD] ${ids.length} build secret(s) mounted (BuildKit)\n`;
        }
        // BuildKit + layer caching (Coolify/Dokploy parity): reuse the previous
        // image of this tag as a cache source so unchanged layers are not
        // rebuilt. BUILDKIT_INLINE_CACHE bakes the cache metadata into the image
        // so the NEXT build can read it via --cache-from. On the first build the
        // tag doesn't exist yet → BuildKit skips the missing cache gracefully.
        await this.ssh.execOrThrow(
          conn,
          `cd ${q(buildCtx)} && DOCKER_BUILDKIT=1 timeout ${BUILD_TIMEOUT_S} docker build --cache-from ${q(imageTag)} --build-arg BUILDKIT_INLINE_CACHE=1 ${dockerBuildArgs}${secretFlags} -f ${q(dockerfilePath)} -t ${q(imageTag)} .`,
          'Docker build failed',
        );
        logs += `[LOCAL BUILD] Docker build OK → ${imageTag}\n`;
      }
      // Best-effort disk hygiene (non-fatal): (1) drop dangling build layers,
      // (2) keep only the last 5 tagged images of THIS service so rollback
      // targets survive (unique per-deploy tags) without filling the disk.
      const repo = imageTag.includes(':')
        ? imageTag.slice(0, imageTag.lastIndexOf(':'))
        : imageTag;
      await this.ssh.exec(
        conn,
        `docker image prune -f; ` +
          `docker images ${q(repo)} --format '{{.Repository}}:{{.Tag}}' | tail -n +6 | xargs -r docker rmi 2>/dev/null || true`,
      );
      onLog(`[LOCAL BUILD] Image built: ${imageTag}`, 'info');
    } finally {
      // Always wipe the workspace AND the build secrets (even on failure).
      await this.ssh.exec(
        conn,
        `rm -rf ${`'${workDir.replace(/'/g, "'\\''")}'`} ${`'${secretsDir.replace(/'/g, "'\\''")}'`}`,
      );
      await conn.dispose();
    }
    return logs;
  }
}
