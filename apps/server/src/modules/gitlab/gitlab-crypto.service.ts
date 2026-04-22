import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { type GitlabConfig } from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

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
  encrypt(value: string): string {
    const secret = this.getConfigSecret();

    const key = createHash('sha256')
      .update(`${secret}::encryption::key`)
      .digest();

    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);

    const valueBuffer = Buffer.from(value, 'utf8');
    let encrypted = cipher.update(valueBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return Buffer.concat([iv, encrypted]).toString('base64');
  }

  decryptConfigToken(value: string): string {
    const secret = this.getConfigSecret();

    try {
      const key = createHash('sha256')
        .update(`${secret}::encryption::key`)
        .digest();

      const buffer = Buffer.from(value, 'base64');
      const iv = buffer.subarray(0, 16);
      const encrypted = buffer.subarray(16);

      const decipher = createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error) {
      throw new InternalServerErrorException(
        `Décryptage a échoué: ${
          error instanceof Error ? error.message : 'erreur inconnue'
        }`,
      );
    }
  }

  private getConfigSecret(): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }
    return secret;
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
