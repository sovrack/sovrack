import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as CryptoJS from 'crypto-js';
import * as sshpk from 'sshpk';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  randomBytes,
} from 'crypto';

@Injectable()
export class ServersCryptoService {
  private readonly sshpkParser = sshpk as unknown as {
    parsePrivateKey: (
      value: string,
      format: 'pem',
    ) => {
      toString: (format: 'openssh' | 'pem' | 'ssh') => string;
      toPublic: () => {
        toString: (format: 'ssh') => string;
      };
    };
  };

  constructor(private readonly configService: ConfigService) {}

  hashToken(token: string): string {
    return CryptoJS.SHA256(token).toString();
  }

  resolveSshMaterial(providedPrivateKey?: string): {
    privateKey: string;
    publicKey: string;
  } {
    if (providedPrivateKey) {
      const normalizedPrivateKey =
        this.normalizePrivateKeyFormat(providedPrivateKey);
      return {
        privateKey: normalizedPrivateKey,
        publicKey: this.deriveOpenSshPublicKey(normalizedPrivateKey),
      };
    }

    return this.generateSshKeyPair();
  }

  normalizePrivateKeyFormat(privateKeyPem: string): string {
    const normalizedLineEndings = privateKeyPem.replace(/\r\n/g, '\n').trim();
    const withTrailingNewLine = `${normalizedLineEndings}\n`;

    try {
      return this.sshpkParser
        .parsePrivateKey(withTrailingNewLine, 'pem')
        .toString('openssh');
    } catch {
      throw new BadRequestException(
        'Clé privée SSH invalide. Formats acceptés: OpenSSH, PKCS8, PKCS1.',
      );
    }
  }

  deriveOpenSshPublicKey(privateKeyPem: string): string {
    try {
      const normalized = this.normalizePrivateKeyFormat(privateKeyPem);
      return this.sshpkParser
        .parsePrivateKey(normalized, 'pem')
        .toPublic()
        .toString('ssh');
    } catch {
      throw new BadRequestException(
        'Clé privée SSH invalide. Formats acceptés: OpenSSH, PKCS8, PKCS1.',
      );
    }
  }

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

  decrypt(encryptedValue: string): string {
    const secret = this.getConfigSecret();

    try {
      const key = createHash('sha256')
        .update(`${secret}::encryption::key`)
        .digest();

      const buffer = Buffer.from(encryptedValue, 'base64');
      const iv = buffer.subarray(0, 16);
      const encrypted = buffer.subarray(16);

      const decipher = createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString('utf8');
    } catch {
      const legacy = this.tryLegacyDecrypt(encryptedValue, secret);
      if (legacy) {
        return legacy;
      }

      throw new InternalServerErrorException(
        'Décryptage a échoué. Vérifiez CONFIG_SECRET et régénérez la clé SSH si nécessaire.',
      );
    }
  }

  private tryLegacyDecrypt(
    encryptedValue: string,
    secret: string,
  ): string | null {
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedValue, secret).toString(
        CryptoJS.enc.Utf8,
      );
      if (decrypted.trim().length === 0) {
        return null;
      }
      return decrypted;
    } catch {
      return null;
    }
  }

  private generateSshKeyPair(): { privateKey: string; publicKey: string } {
    const { privateKey: rawPrivateKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    const privateKey = this.normalizePrivateKeyFormat(rawPrivateKey);
    const publicKey = this.deriveOpenSshPublicKey(privateKey);

    return {
      privateKey,
      publicKey,
    };
  }

  private getConfigSecret(): string {
    const secret = this.configService.get<string>('CONFIG_SECRET');
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }
    return secret;
  }
}
