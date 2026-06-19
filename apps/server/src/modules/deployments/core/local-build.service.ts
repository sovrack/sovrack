import { BadRequestException, Injectable } from '@nestjs/common';
import { CryptoService } from '../../../core/crypto/crypto.service';
import { SshExecutorService } from '../../../core/ssh/ssh-executor.service';
import { ServersCryptoService } from '../../infrastructure/servers/services/servers-crypto.service';
import { ServerHostKeyService } from '../../infrastructure/servers/services/server-host-key.service';
import { buildAuthenticatedCloneUrl } from '../../../core/utils/clone-url.util';
import {
  isNamespacedRepoPath,
  normalizeRepoPath,
} from '../../../core/utils/repo-path.util';

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
  /** Émetteur de logs live (le gateway reste dans l'executor). */
  onLog: (message: string, level?: BuildLogLevel) => void;
};

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

      await this.ssh.execOrThrow(
        conn,
        `rm -rf ${q(workDir)} && git clone --depth 1 -b ${q(branch)} ${q(cloneUrl)} ${q(workDir)}`,
        'Git clone failed',
      );
      logs += `[LOCAL BUILD] Cloned ${repoPath}@${branch}\n`;
      onLog(`[LOCAL BUILD] Clone OK`, 'info');

      const buildCtx = rootDir === '.' ? workDir : `${workDir}/${rootDir}`;
      const dockerBuildArgs = buildArgs
        .map((a) => `--build-arg ${q(a)}`)
        .join(' ');
      const nixpacksEnvArgs = buildArgs.map((a) => `--env ${q(a)}`).join(' ');

      if (buildPack === 'NIXPACKS') {
        await this.ssh.execOrThrow(
          conn,
          `cd ${q(buildCtx)} && nixpacks build . ${nixpacksEnvArgs} --name ${q(imageTag)}`,
          'Nixpacks build failed',
        );
        logs += `[LOCAL BUILD] Nixpacks build OK → ${imageTag}\n`;
      } else if (buildPack === 'STATIC') {
        const nginxConf = `server { listen 80; root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; }`;
        await this.ssh.execOrThrow(
          conn,
          `cd ${q(buildCtx)} && printf 'FROM nginx:alpine\\nCOPY . /usr/share/nginx/html\\n' > Dockerfile.static && ` +
            `printf '%s' ${q(nginxConf)} > nginx.conf.tmp && ` +
            `docker build -f Dockerfile.static -t ${q(imageTag)} .`,
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
        await this.ssh.execOrThrow(
          conn,
          `cd ${q(buildCtx)} && docker build ${dockerBuildArgs} -f ${q(dockerfilePath)} -t ${q(imageTag)} .`,
          'Docker build failed',
        );
        logs += `[LOCAL BUILD] Docker build OK → ${imageTag}\n`;
      }
      onLog(`[LOCAL BUILD] Image built: ${imageTag}`, 'info');
    } finally {
      await this.ssh.exec(
        conn,
        `rm -rf ${`'${workDir.replace(/'/g, "'\\''")}'`}`,
      );
      await conn.dispose();
    }
    return logs;
  }
}
