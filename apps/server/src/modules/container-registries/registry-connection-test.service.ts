import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { RegistryProviderType, type RegistryConfig } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../shared/database/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';

/**
 * Test de connexion à un registre de conteneurs (Docker Hub, registre Docker v2
 * GitLab/GHCR/privé, ECR, GCR). Suit le vrai handshake d'authentification et
 * persiste l'état de connexion. Extrait de ContainerRegistriesService pour
 * isoler la logique réseau du CRUD.
 */
@Injectable()
export class RegistryConnectionTestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly crypto: CryptoService,
  ) {}

  async test(
    registry: RegistryConfig,
  ): Promise<{ ok: boolean; message: string }> {
    try {
      if (registry.type === RegistryProviderType.DOCKER_HUB) {
        return await this.testDockerHub(registry);
      }
      if (
        registry.type === RegistryProviderType.GITLAB ||
        registry.type === RegistryProviderType.DOCKER_REGISTRY
      ) {
        return await this.testDockerRegistry(registry);
      }
      if (registry.type === RegistryProviderType.ECR) {
        return await this.testECR(registry);
      }
      if (registry.type === RegistryProviderType.GCR) {
        return await this.testGCR(registry);
      }
      return { ok: false, message: 'Type de registre non reconnu' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erreur de connexion inconnue';
      await this.prisma.registryConfig.update({
        where: { id: registry.id },
        data: { isConnected: false, connectionError: message },
      });
      return { ok: false, message };
    }
  }

  private async testDockerHub(
    registry: RegistryConfig,
  ): Promise<{ ok: boolean; message: string }> {
    const username = registry.username?.trim();
    const password = registry.password
      ? this.crypto.decrypt(registry.password).trim()
      : '';

    if (!username || !password) {
      throw new BadRequestException('Docker Hub username et password requis');
    }

    const response = await firstValueFrom(
      this.http.post<{ token?: string }>(
        'https://hub.docker.com/v2/users/login',
        { username, password },
        { timeout: 10000 },
      ),
    );

    if (typeof response.data.token === 'string' && response.data.token) {
      await this.prisma.registryConfig.update({
        where: { id: registry.id },
        data: { isConnected: true, connectionError: null },
      });
      return { ok: true, message: 'Connexion Docker Hub réussie' };
    }

    throw new BadRequestException('Authentification Docker Hub échouée');
  }

  /**
   * Teste un registre Docker v2 (GitLab/GHCR/registre privé) en suivant le
   * VRAI handshake d'authentification :
   *  1. GET /v2/  →  200 = OK direct (anonyme ou Basic accepté).
   *  2. 401 + `WWW-Authenticate: Bearer realm=…,service=…` = NORMAL → on suit le
   *     realm avec les identifiants Basic pour obtenir un token : 200+token =
   *     identifiants valides ; 401/403 = identifiants refusés.
   *  3. 401 + `Basic` sans creds = le registre exige une authentification.
   */
  private async testDockerRegistry(
    registry: RegistryConfig,
  ): Promise<{ ok: boolean; message: string }> {
    const rawUrl = registry.registryUrl?.trim();
    const username = registry.username?.trim();
    const password = registry.password
      ? this.crypto.decrypt(registry.password).trim()
      : '';

    if (!rawUrl) throw new BadRequestException('Registry URL requise');

    const registryUrl = (
      rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`
    ).replace(/\/+$/, '');
    const auth = username && password ? { username, password } : undefined;

    const ping = await firstValueFrom(
      this.http.get(`${registryUrl}/v2/`, {
        auth,
        timeout: 10000,
        validateStatus: () => true,
      }),
    );

    if (ping.status === 200) {
      return this.markRegistryConnected(
        registry.id,
        'Connexion au registre réussie.',
      );
    }

    if (ping.status === 401) {
      const challenge = this.parseBearerChallenge(
        String(ping.headers['www-authenticate'] ?? ''),
      );

      // Auth par token (Bearer) : on demande un token au realm avec les creds.
      if (challenge?.realm) {
        // GitLab Container Registry : realm en /jwt/auth + service container_registry.
        const isGitlab =
          /\/jwt\/auth/i.test(challenge.realm) ||
          challenge.service === 'container_registry';
        const gitlabHint = isGitlab
          ? ' GitLab : username = ton login, token = un Personal/Project Access Token avec le scope read_registry (write_registry pour push).'
          : '';
        if (!auth) {
          throw new BadRequestException(
            `Ce registre exige une authentification (username + token/mot de passe).${gitlabHint}`,
          );
        }
        const tokenRes = await firstValueFrom(
          this.http.get<{ token?: string; access_token?: string }>(
            challenge.realm,
            {
              params: {
                service: challenge.service,
                scope: challenge.scope,
              },
              auth,
              timeout: 10000,
              validateStatus: () => true,
            },
          ),
        );
        if (
          tokenRes.status === 200 &&
          (tokenRes.data?.token || tokenRes.data?.access_token)
        ) {
          return this.markRegistryConnected(
            registry.id,
            'Authentification au registre réussie (token Bearer).',
          );
        }
        throw new BadRequestException(
          `Identifiants refusés par le registre (HTTP ${tokenRes.status}). Vérifiez username + token.${gitlabHint}`,
        );
      }

      // Auth Basic exigée.
      if (!auth) {
        throw new BadRequestException(
          'Ce registre exige une authentification (username + token/mot de passe).',
        );
      }
      throw new BadRequestException(
        'Identifiants invalides pour ce registre (401).',
      );
    }

    throw new BadRequestException(
      `Réponse inattendue du registre (HTTP ${ping.status}).`,
    );
  }

  /** Parse un en-tête `WWW-Authenticate: Bearer realm="…",service="…",scope="…"`. */
  private parseBearerChallenge(
    header: string,
  ): { realm: string; service?: string; scope?: string } | null {
    if (!/^bearer/i.test(header.trim())) return null;
    const pick = (key: string): string | undefined => {
      const m = new RegExp(`${key}="([^"]*)"`, 'i').exec(header);
      return m?.[1];
    };
    const realm = pick('realm');
    if (!realm) return null;
    return { realm, service: pick('service'), scope: pick('scope') };
  }

  private async markRegistryConnected(
    id: string,
    message: string,
  ): Promise<{ ok: boolean; message: string }> {
    await this.prisma.registryConfig.update({
      where: { id },
      data: { isConnected: true, connectionError: null },
    });
    return { ok: true, message };
  }

  private async testECR(
    registry: RegistryConfig,
  ): Promise<{ ok: boolean; message: string }> {
    const message =
      'Test ECR non supporté actuellement: configurez un test via AWS SDK.';
    await this.prisma.registryConfig.update({
      where: { id: registry.id },
      data: { isConnected: false, connectionError: message },
    });
    return { ok: false, message };
  }

  private async testGCR(
    registry: RegistryConfig,
  ): Promise<{ ok: boolean; message: string }> {
    const message =
      'Test GCR non supporté actuellement: configurez un test via GCP IAM/Artifact Registry.';
    await this.prisma.registryConfig.update({
      where: { id: registry.id },
      data: { isConnected: false, connectionError: message },
    });
    return { ok: false, message };
  }
}
