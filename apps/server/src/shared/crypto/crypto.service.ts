import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

@Injectable()
export class CryptoService {
  // Préfixe du format authentifié AES-256-GCM. Les valeurs sans préfixe sont
  // l'ancien format AES-256-CBC (toujours déchiffré ci-dessous = rétro-compat).
  private static readonly V2_PREFIX = 'v2:';

  private deriveKey(secret: string): Buffer {
    return createHash('sha256').update(`${secret}::encryption::key`).digest();
  }

  /**
   * Chiffre en AES-256-GCM (authentifié → toute altération du ciphertext est
   * détectée au déchiffrement). Format : `v2:` + base64(iv[12] | tag[16] | data).
   */
  encrypt(value: string): string {
    const key = this.deriveKey(this.getSecret());
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(value, 'utf8')),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return (
      CryptoService.V2_PREFIX +
      Buffer.concat([iv, tag, encrypted]).toString('base64')
    );
  }

  decrypt(encryptedValue: string): string {
    const secret = this.getSecret();
    const key = this.deriveKey(secret);

    // Nouveau format authentifié (v2 = GCM). Un échec ici = altération ou
    // mauvaise clé → on laisse remonter l'erreur (pas de repli silencieux).
    if (encryptedValue.startsWith(CryptoService.V2_PREFIX)) {
      const buffer = Buffer.from(
        encryptedValue.slice(CryptoService.V2_PREFIX.length),
        'base64',
      );
      const iv = buffer.subarray(0, 12);
      const tag = buffer.subarray(12, 28);
      const encrypted = buffer.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');
    }

    // CryptoJS/OpenSSL préfixe explicitement ses valeurs salées par
    // `Salted__`. Il faut reconnaître ce format avant l'ancien CBC interne :
    // certains ciphertexts CryptoJS ont, par hasard, un padding CBC valide et
    // produiraient alors du texte corrompu au lieu de déclencher le fallback.
    const decoded = Buffer.from(encryptedValue, 'base64');
    if (
      decoded.length > 16 &&
      decoded.subarray(0, 8).equals(Buffer.from('Salted__', 'utf8'))
    ) {
      return this.decryptLegacy(encryptedValue, secret);
    }

    // Ancien format AES-256-CBC (base64(iv[16] | data)) — rétro-compat.
    try {
      const iv = decoded.subarray(0, 16);
      const encrypted = decoded.subarray(16);
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
      const buffer = Buffer.from(encryptedValue, 'base64');
      const saltedMagic = Buffer.from('Salted__', 'utf8');

      if (buffer.length <= 16 || !buffer.subarray(0, 8).equals(saltedMagic)) {
        throw new Error('Format legacy invalide (Salted__ manquant)');
      }

      const salt = buffer.subarray(8, 16);
      const ciphertext = buffer.subarray(16);
      const derived = this.evpBytesToKey(secret, salt);
      const key = derived.subarray(0, 32);
      const iv = derived.subarray(32, 48);

      const decipher = createDecipheriv('aes-256-cbc', key, iv);
      decipher.setAutoPadding(true);
      let decrypted = decipher.update(ciphertext);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'Décryptage échoué. Vérifiez CONFIG_SECRET.',
      );
    }
  }

  /**
   * OpenSSL EVP_BytesToKey (MD5, 1 iteration) — reproduit le KDF utilisé par
   * CryptoJS.AES.encrypt dans l'ancienne version du chiffrement.
   * Nécessaire uniquement pour déchiffrer les données legacy (pré-v2).
   */
  private evpBytesToKey(password: string, salt: Buffer): Buffer {
    const needed = 48; // 32 key + 16 iv
    const result = Buffer.alloc(needed);
    let digest: Buffer | null = null;
    let pos = 0;

    while (pos < needed) {
      const h = createHash('md5');
      if (digest) h.update(digest);
      h.update(Buffer.from(password, 'utf8'));
      h.update(salt);
      digest = h.digest();
      const toCopy = Math.min(needed - pos, digest.length);
      digest.copy(result, pos, 0, toCopy);
      pos += toCopy;
    }

    return result;
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
