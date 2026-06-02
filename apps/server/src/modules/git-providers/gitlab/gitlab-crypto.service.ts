import { Injectable } from '@nestjs/common';
import { type GitlabConfig } from '@prisma/client';
import { CryptoService } from '../../../core/crypto/crypto.service';

export type PublicGitlabConfig = Omit<
  GitlabConfig,
  'gitlabToken' | 'deployTokenValue' | 'webhookSecret'
> & {
  gitlabToken: string;
  deployTokenValue: string;
  webhookSecretConfigured: boolean;
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

  toPublicConfig(config: GitlabConfig): PublicGitlabConfig {
    return {
      ...config,
      gitlabToken: '***',
      deployTokenValue: config.deployTokenValue ? '***' : '',
      webhookSecretConfigured: Boolean(config.webhookSecret),
    };
  }
}
