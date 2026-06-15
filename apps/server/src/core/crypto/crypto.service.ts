import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as CryptoJS from 'crypto-js';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

@Injectable()
export class CryptoService {
  encrypt(value: string): string {
    const secret = this.getSecret();
    const key = createHash('sha256')
      .update(`${secret}::encryption::key`)
      .digest();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(Buffer.from(value, 'utf8'));
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return Buffer.concat([iv, encrypted]).toString('base64');
  }

  decrypt(encryptedValue: string): string {
    const secret = this.getSecret();
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
      return this.decryptLegacy(encryptedValue, secret);
    }
  }

  encryptOptional(value: string | undefined): string | null {
    if (!value || value.trim() === '') return null;
    return this.encrypt(value.trim());
  }

  /**
   * Decrypt a value that MAY be encrypted or MAY be legacy plaintext JSON.
   * Used for secretsEnv, which historically was stored as plaintext JSON and is
   * now encrypted at rest. Plaintext JSON (starts with `{`/`[`) is returned
   * unchanged; anything else is treated as ciphertext and decrypted, falling
   * back to the raw value if decryption fails. Null/empty pass through.
   */
  decryptSafe(value: string | null | undefined): string | null {
    if (value == null) return null;
    const trimmed = value.trim();
    if (trimmed === '' || trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return value;
    }
    try {
      return this.decrypt(value);
    } catch {
      return value;
    }
  }

  private decryptLegacy(encryptedValue: string, secret: string): string {
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedValue, secret).toString(
        CryptoJS.enc.Utf8,
      );
      if (decrypted.trim().length === 0) {
        throw new InternalServerErrorException(
          'Décryptage échoué — valeur vide après décryptage legacy',
        );
      }
      return decrypted;
    } catch {
      throw new InternalServerErrorException(
        'Décryptage échoué. Vérifiez CONFIG_SECRET.',
      );
    }
  }

  private getSecret(): string {
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }
    return secret;
  }
}
