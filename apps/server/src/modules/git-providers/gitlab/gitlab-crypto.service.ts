import { Injectable } from '@nestjs/common';
import { type AppProviderLink, type AppSourceType } from '@prisma/client';
import { CryptoService } from '../../../core/crypto/crypto.service';

/**
 * Stable public shape returned by the `/gitlab/config` endpoints.
 *
 * Intentionally keeps the historical, provider-facing field names
 * (`gitlabId`, `gitlabUrl`, `gitlabGroupId`, `gitlabToken`) so the public API
 * contract stays stable regardless of the internal provider-neutral Prisma
 * rename (AppProviderLink.externalId/providerUrl/…). Secrets are masked.
 */
export type PublicGitlabConfig = {
  id: string;
  gitlabUrl: string;
  gitlabId: number | null;
  gitlabGroupId: number | null;
  defaultBranch: string;
  sourceType: AppSourceType;
  providerId: string | null;
  deployTokenUsername: string | null;
  registryUrl: string | null;
  gitlabToken: string;
  deployTokenValue: string;
  webhookSecretConfigured: boolean;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class GitlabCryptoService {
  constructor(private readonly crypto: CryptoService) {}

  encrypt(value: string): string {
    return this.crypto.encrypt(value);
  }

  decryptConfigToken(value: string): string {
    return this.crypto.decrypt(value);
  }

  toPublicConfig(config: AppProviderLink): PublicGitlabConfig {
    return {
      id: config.id,
      gitlabUrl: config.providerUrl,
      gitlabId: config.externalId != null ? Number(config.externalId) : null,
      gitlabGroupId:
        config.externalGroupId != null ? Number(config.externalGroupId) : null,
      defaultBranch: config.defaultBranch,
      sourceType: config.sourceType,
      providerId: config.providerId,
      deployTokenUsername: config.deployTokenUsername,
      registryUrl: config.registryUrl,
      gitlabToken: '***',
      deployTokenValue: config.deployTokenValue ? '***' : '',
      webhookSecretConfigured: Boolean(config.webhookSecret),
      projectId: config.projectId,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
