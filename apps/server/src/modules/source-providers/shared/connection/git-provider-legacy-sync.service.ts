import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { RegistryProviderType } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { inferGitlabRegistryUrl } from './git-provider-config.util';

/**
 * Owns the LEGACY GitLab compatibility layer extracted from
 * GitProviderConfigService (god-file split):
 *  - bootstrapping a GitProviderConfig row from the old PlatformConfig keys,
 *  - mirroring the default GitLab provider back into those PlatformConfig keys,
 *  - auto-provisioning the GitLab container registry from the provider.
 * Pure GitLab-legacy concern, isolated so the main config service stays focused
 * on CRUD across providers.
 */
@Injectable()
export class GitProviderLegacySyncService {
  private readonly logger = new Logger(GitProviderLegacySyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * The former global PlatformConfig bootstrap is intentionally disabled.
   * Copying a global secret into whichever workspace calls first would violate
   * tenant isolation. Existing providers are assigned explicitly by migration.
   */
  bootstrapIfNeeded(_teamId: string): Promise<void> {
    return Promise.resolve();
  }

  /** No-op: tenant provider secrets must never be mirrored globally. */
  syncDefaultConfig(_teamId: string): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Auto-provisionne (et resync) le registre GitLab lié à un provider Git. La
   * logique « pro » : on RÉUTILISE le token du provider comme mot de passe du
   * registre et on récupère le username via l'API GitLab (`/user`) — auth
   * registre par PAT = username du compte. Ainsi le registre est utilisable
   * immédiatement (si le token a le scope read_registry/api), sans ressaisie.
   * Lien `providerId` → dédoublonnage + resync à chaque update du provider.
   */
  async syncRegistry(provider: {
    id: string;
    teamId: string;
    name: string;
    providerUrl: string;
    adminToken: string | null;
  }): Promise<void> {
    try {
      const registryName = `GitLab Registry — ${provider.name}`;
      const registryUrl = inferGitlabRegistryUrl(provider.providerUrl);

      // Réutilise le token (déjà chiffré, même CryptoService) + username via API.
      let username: string | null = null;
      const encryptedPassword: string | null = provider.adminToken ?? null;
      if (provider.adminToken) {
        const token = this.crypto.decrypt(provider.adminToken);
        username = await this.fetchGitlabUsername(provider.providerUrl, token);
      }

      const data = {
        name: registryName,
        teamId: provider.teamId,
        type: RegistryProviderType.GITLAB,
        registryUrl,
        providerId: provider.id,
        ...(username ? { username } : {}),
        ...(encryptedPassword ? { password: encryptedPassword } : {}),
      };

      // Dédoublonnage par provider (robuste au renommage), repli sur type+name.
      const existing =
        (await this.prisma.registryConfig.findFirst({
          where: { teamId: provider.teamId, providerId: provider.id },
        })) ??
        (await this.prisma.registryConfig.findFirst({
          where: {
            teamId: provider.teamId,
            type: RegistryProviderType.GITLAB,
            name: registryName,
          },
        }));

      if (existing) {
        await this.prisma.registryConfig.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.prisma.registryConfig.create({
          data: { ...data, isDefault: false, isConnected: false },
        });
      }

      this.logger.log(
        `GitLab registry auto-configured: "${registryName}" → ${registryUrl}` +
          (username ? ` (user ${username})` : ' (token à compléter)'),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to auto-configure GitLab registry for "${provider.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Récupère le username GitLab via l'API (`GET /api/v4/user`). Best-effort. */
  private async fetchGitlabUsername(
    providerUrl: string,
    token: string,
  ): Promise<string | null> {
    try {
      const url = `${providerUrl.replace(/\/$/, '')}/api/v4/user`;
      const res = await firstValueFrom(
        this.http.get<{ username?: string }>(url, {
          headers: { 'PRIVATE-TOKEN': token },
          timeout: 8000,
          validateStatus: () => true,
        }),
      );
      return res.status === 200 && res.data?.username
        ? res.data.username
        : null;
    } catch {
      return null;
    }
  }
}
