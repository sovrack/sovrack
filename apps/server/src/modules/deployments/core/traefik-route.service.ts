import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { SshExecutorService } from '../../../adapters/ssh/ssh-executor.service';
import { ServersCryptoService } from '../../../adapters/ssh/servers-crypto.service';
import { ServerHostKeyService } from '../../../adapters/ssh/server-host-key.service';

type SshServer = {
  host: string;
  port: number;
  username: string;
  sshKey: string;
};

/**
 * Routage Traefik (provider fichier) extrait du DockerDeployExecutorService :
 *  - résolution d'un sous-domaine automatique pour les services web sans domaine,
 *  - écriture de la config dynamique Traefik (réseau 'web' + fichier YAML).
 *
 * Découplé du gateway de logs : les méthodes renvoient les lignes de log à
 * l'appelant, qui les émet (live + persistées).
 */
@Injectable()
export class TraefikRouteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docker: DockerApiService,
    private readonly ssh: SshExecutorService,
    private readonly serversCrypto: ServersCryptoService,
    private readonly serverHostKeys: ServerHostKeyService,
  ) {}

  private async getPlatformConfig(key: string): Promise<string | null> {
    const row = await this.prisma.platformConfig.findUnique({ where: { key } });
    const v = row?.value?.trim();
    return v ? v : null;
  }

  /**
   * Calcule (et persiste) un sous-domaine automatique pour un service web sans
   * domaine explicite. Retourne le domaine ou null si la fonctionnalité n'est pas
   * activée (ni PLATFORM_BASE_DOMAIN ni PLATFORM_AUTO_SUBDOMAIN).
   */
  async resolveAutoSubdomain(
    projectId: string,
    serviceEnvId: string,
    serviceName: string,
    envName: string,
    serverHost: string | undefined,
  ): Promise<string | null> {
    const base = await this.getPlatformConfig('PLATFORM_BASE_DOMAIN');
    const autoFlag = await this.getPlatformConfig('PLATFORM_AUTO_SUBDOMAIN');
    const slug = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'app';
    const sub = `${slug(serviceName)}-${slug(envName)}`;

    let domain: string | null = null;
    if (base) {
      domain = `${sub}.${base.replace(/^\.+|\.+$/g, '')}`;
    } else if (
      serverHost &&
      /^\d+\.\d+\.\d+\.\d+$/.test(serverHost) &&
      ['true', '1', 'nip.io', 'yes'].includes((autoFlag ?? '').toLowerCase())
    ) {
      domain = `${sub}.${serverHost}.nip.io`;
    }
    if (!domain) return null;

    // Persiste le domaine (source unique de vérité pour l'URL publique + l'UI).
    await this.prisma.domain
      .upsert({
        where: { projectId_name: { projectId, name: domain } },
        update: { serviceEnvId, verified: true },
        create: { projectId, serviceEnvId, name: domain, verified: true },
      })
      .catch(() => undefined);
    return domain;
  }

  /**
   * Branche le conteneur sur le réseau partagé 'web' et écrit la config dynamique
   * Traefik routant Host(domain) → http://<conteneur>:<port> (HTTPS via résolveur
   * Let's Encrypt 'le' + routeur HTTP de secours). Indépendant de la version du
   * daemon Docker. Renvoie la ligne de log de confirmation.
   */
  async applyRoute(
    serverId: string,
    server: SshServer,
    serviceEnvId: string,
    domain: string,
    containerNames: string | string[],
    servicePort: number,
  ): Promise<string> {
    const names = Array.isArray(containerNames)
      ? containerNames
      : [containerNames];

    // 1. Connect every container to the shared Traefik network ('web').
    await this.docker.createNetwork(serverId, 'web').catch(() => undefined);
    for (const cn of names) {
      await this.docker
        .connectNetwork(serverId, 'web', cn)
        .catch(() => undefined);
    }

    // 2. Config dynamique Traefik (base64 pour éviter tout souci de quoting —
    //    la règle Host contient des backticks). Multiple backends = round-robin.
    const safeId = serviceEnvId.replace(/[^a-zA-Z0-9_-]/g, '-');
    const backendLines = names.map(
      (cn) => `          - url: "http://${cn}:${String(servicePort)}"`,
    );
    const yaml = [
      'http:',
      '  routers:',
      // Routeur HTTPS (Let's Encrypt). Reste valable pour un vrai domaine public.
      `    ${safeId}:`,
      `      rule: "Host(\`${domain}\`)"`,
      '      entryPoints: ["websecure"]',
      `      service: ${safeId}`,
      '      tls:',
      '        certResolver: le',
      // Routeur HTTP (port 80) : garantit l'accès même sans certificat valide
      // (ex. sous-domaine nip.io sur IP privée où l'ACME ne peut pas émettre).
      `    ${safeId}-web:`,
      `      rule: "Host(\`${domain}\`)"`,
      '      entryPoints: ["web"]',
      `      service: ${safeId}`,
      '  services:',
      `    ${safeId}:`,
      '      loadBalancer:',
      '        servers:',
      ...backendLines,
      '',
    ].join('\n');
    const b64 = Buffer.from(yaml, 'utf8').toString('base64');

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
      await this.ssh.execOrThrow(
        conn,
        `sudo mkdir -p /opt/traefik/dynamic && echo ${b64} | base64 -d | sudo tee /opt/traefik/dynamic/${safeId}.yml >/dev/null`,
        'Écriture de la route Traefik échouée',
      );
    } finally {
      await conn.dispose();
    }
    return `[TRAEFIK] Route HTTPS configurée : https://${domain}`;
  }
}
