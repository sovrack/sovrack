import { BadRequestException, Injectable } from '@nestjs/common';
import * as sshpk from 'sshpk';
import { createHash, generateKeyPairSync } from 'crypto';
import { CryptoService } from '../../../../core/crypto/crypto.service';

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

  constructor(private readonly crypto: CryptoService) {}

  // ─── Encrypt / Decrypt — delegated to shared CryptoService ──────────────

  encrypt(value: string): string {
    return this.crypto.encrypt(value);
  }

  decrypt(encryptedValue: string): string {
    return this.crypto.decrypt(encryptedValue);
  }

  // ─── SSH helpers ─────────────────────────────────────────────────────────

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
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

  private generateSshKeyPair(): { privateKey: string; publicKey: string } {
    const { privateKey: rawPrivateKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const privateKey = this.normalizePrivateKeyFormat(rawPrivateKey);
    const publicKey = this.deriveOpenSshPublicKey(privateKey);

    return { privateKey, publicKey };
  }
}
