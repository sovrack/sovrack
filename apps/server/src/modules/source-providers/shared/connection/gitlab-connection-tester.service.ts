import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { type GitProviderConfig } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { GitProviderOauthService } from './git-provider-oauth.service';
import { normalizeGitlabBaseUrl } from './git-provider-config.util';

/**
 * Test de connexion aux providers GitLab (OAuth ou Admin Token), pour un
 * provider enregistré ou pour la config legacy mono-GitLab. Pur « given creds,
 * hit /api/v4/user » — la résolution du provider et le CRUD restent dans
 * GitProviderConfigService.
 */
@Injectable()
export class GitlabConnectionTesterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly crypto: CryptoService,
    private readonly oauth: GitProviderOauthService,
  ) {}

  async testProvider(
    provider: GitProviderConfig,
  ): Promise<{ ok: boolean; message: string }> {
    const refreshed =
      await this.oauth.refreshProviderOAuthTokenIfNeeded(provider);
    const gitlabUrl = normalizeGitlabBaseUrl(refreshed.providerUrl.trim());

    if (!gitlabUrl)
      throw new BadRequestException('GitLab URL manquant pour ce provider');

    const oauthToken = refreshed.oauthAccessToken
      ? this.crypto.decrypt(refreshed.oauthAccessToken).trim()
      : '';
    const adminToken = refreshed.adminToken
      ? this.crypto.decrypt(refreshed.adminToken).trim()
      : '';

    if (!oauthToken && !adminToken) {
      throw new BadRequestException(
        'Configure un token OAuth ou un Admin Token pour ce provider',
      );
    }

    if (oauthToken) {
      try {
        await this.requestCurrentUser(gitlabUrl, {
          Authorization: `Bearer ${oauthToken}`,
        });
        return { ok: true, message: 'Connexion GitLab valide (OAuth)' };
      } catch {
        // fallback to admin token
      }
    }

    if (adminToken) {
      await this.requestCurrentUser(gitlabUrl, {
        'PRIVATE-TOKEN': adminToken,
      });
      return {
        ok: true,
        message: oauthToken
          ? 'Connexion GitLab valide (fallback Admin Token)'
          : 'Connexion GitLab valide (Admin Token)',
      };
    }

    throw new BadRequestException('Test GitLab échoué');
  }

  async testLegacyConfig(): Promise<{ ok: boolean; message: string }> {
    const gitlabUrl = (
      (await this.getLegacyPlatformConfig('GITLAB_URL')) ?? ''
    ).trim();
    const oauthToken = (
      (await this.getLegacyPlatformConfig('GITLAB_OAUTH_ACCESS_TOKEN')) ?? ''
    ).trim();
    const adminToken = (
      (await this.getLegacyPlatformConfig('GITLAB_TOKEN')) ?? ''
    ).trim();

    if (!gitlabUrl)
      throw new BadRequestException('GITLAB_URL doit être configuré');
    if (!oauthToken && !adminToken) {
      throw new BadRequestException(
        'Configure un token OAuth GitLab ou GITLAB_TOKEN avant le test',
      );
    }

    const normalizedUrl = normalizeGitlabBaseUrl(gitlabUrl);

    if (oauthToken) {
      try {
        await this.requestCurrentUser(normalizedUrl, {
          Authorization: `Bearer ${oauthToken}`,
        });
        return { ok: true, message: 'Connexion GitLab valide (OAuth)' };
      } catch {
        // fallback
      }
    }

    if (adminToken) {
      await this.requestCurrentUser(normalizedUrl, {
        'PRIVATE-TOKEN': adminToken,
      });
      return {
        ok: true,
        message: oauthToken
          ? 'Connexion GitLab valide (fallback Admin Token)'
          : 'Connexion GitLab valide (Admin Token)',
      };
    }

    throw new BadRequestException('Test GitLab échoué');
  }

  private async requestCurrentUser(
    gitlabBaseUrl: string,
    headers: Record<string, string>,
  ): Promise<void> {
    await firstValueFrom(
      this.http.get(`${gitlabBaseUrl}/api/v4/user`, { headers }),
    );
  }

  // Reads a legacy single-GitLab PlatformConfig value (used by the legacy-config
  // connection test). The write/sync side of these keys lives in
  // GitProviderLegacySyncService.
  private async getLegacyPlatformConfig(key: string): Promise<string | null> {
    const config = await this.prisma.platformConfig.findUnique({
      where: { key },
    });
    if (!config) return null;
    return config.isSecret ? this.crypto.decrypt(config.value) : config.value;
  }
}
