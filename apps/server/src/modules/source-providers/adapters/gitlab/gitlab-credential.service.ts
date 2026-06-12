import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { CryptoService } from '../../../../core/crypto/crypto.service';
import type { RegistryCredentials } from '../../contracts/git-provider.contract';

@Injectable()
export class GitlabCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {}

  resolveRegistryCredentialsFromConfig(config: any): RegistryCredentials {
    const deployTokenValue = config.deployTokenValue
      ? this.cryptoService.decrypt(config.deployTokenValue)
      : '';
    const gitlabToken = this.cryptoService.decrypt(
      config.providerToken,
    );

    const isValidDeployToken =
      deployTokenValue &&
      deployTokenValue.length > 10 &&
      (deployTokenValue.startsWith('gldt-') ||
        deployTokenValue.startsWith('gr-'));

    const registryUrl =
      config.registryUrl?.trim() || this.extractRegistryUrl(config.providerUrl);

    if (isValidDeployToken && config.deployTokenUsername?.trim()) {
      return {
        registryUrl,
        username: config.deployTokenUsername.trim(),
        password: deployTokenValue,
      };
    }

    if (config.deployTokenValue) {
      return {
        registryUrl,
        username: 'oauth2',
        password: gitlabToken,
      };
    }

    return {
      registryUrl,
      username: 'oauth2',
      password: gitlabToken,
    };
  }

  resolveRegistryHost(
    registryUrl: string | null | undefined,
    gitlabUrl: string,
  ): string {
    if (registryUrl?.trim()) return this.cleanHost(registryUrl);
    try {
      const { hostname, port, host } = new URL(gitlabUrl);
      if (hostname.toLowerCase() === 'gitlab.com') return 'registry.gitlab.com';
      return port ? host : `${hostname}:5050`;
    } catch {
      return this.cleanHost(gitlabUrl);
    }
  }

  cleanHost(v: string): string {
    return v.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }

  extractRegistryUrl(gitlabUrl: string): string {
    try {
      const parsed = new URL(gitlabUrl);
      return parsed.host;
    } catch {
      return gitlabUrl;
    }
  }

  extractPathFromUrl(url: string): string | null {
    try {
      const path = new URL(url).pathname
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
        .replace(/\.git$/i, '');
      return path || null;
    } catch {
      return null;
    }
  }

  isPlaceholderPath(
    config: { externalId?: bigint | null; externalGroupId?: bigint | null; sourceType?: any },
    path: string,
  ): boolean {
    if (config.externalId && path.startsWith(`project-${String(config.externalId)}/`)) return true;
    if (config.externalGroupId && path.startsWith(`group-${String(config.externalGroupId)}/`)) return true;
    return false;
  }
}
