import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { type GitlabConfig } from '@prisma/client';
import * as CryptoJS from 'crypto-js';

export type PublicGitlabConfig = Omit<
  GitlabConfig,
  'gitlabToken' | 'deployTokenValue' | 'webhookSecret'
> & {
  gitlabToken: string;
  deployTokenValue: string;
  webhookSecret: string | null;
};

@Injectable()
export class GitlabCryptoService {
  encrypt(value: string): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }

    return CryptoJS.AES.encrypt(value, secret).toString();
  }

  decryptConfigToken(value: string): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }

    const decrypted = CryptoJS.AES.decrypt(value, secret).toString(
      CryptoJS.enc.Utf8,
    );

    if (decrypted) {
      return decrypted;
    }

    return value;
  }

  toPublicConfig(
    config: GitlabConfig,
    webhookSecretOverride?: string,
  ): PublicGitlabConfig {
    const webhookSecret = webhookSecretOverride
      ? webhookSecretOverride
      : config.webhookSecret
        ? this.decryptConfigToken(config.webhookSecret)
        : null;

    return {
      ...config,
      gitlabToken: '***',
      deployTokenValue: config.deployTokenValue ? '***' : '',
      webhookSecret,
    };
  }
}
