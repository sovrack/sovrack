import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as CryptoJS from 'crypto-js';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
} from 'crypto';
import * as sshpk from 'sshpk';

@Injectable()
export class ServersCryptoService {
  constructor(private readonly configService: ConfigService) {}

  hashToken(token: string): string {
    return CryptoJS.SHA256(token).toString();
  }

  resolveSshMaterial(providedPrivateKey?: string): {
    privateKey: string;
    publicKey: string;
  } {
    if (providedPrivateKey) {
      return {
        privateKey: providedPrivateKey,
        publicKey: this.deriveOpenSshPublicKey(providedPrivateKey),
      };
    }

    const { privateKey: pkcs8Key, publicKey } = this.generateSshKeyPair();

    let opensshPrivateKey: string;
    try {
      const key = sshpk.parsePrivateKey(pkcs8Key, 'pem');
      opensshPrivateKey = key.toString('openssh');
    } catch {
      opensshPrivateKey = pkcs8Key;
    }

    return {
      privateKey: opensshPrivateKey,
      publicKey: this.convertPublicKeyPemToOpenSsh(publicKey),
    };
  }

  normalizePrivateKeyFormat(privateKeyPem: string): string {
    try {
      try {
        const key = sshpk.parsePrivateKey(privateKeyPem, 'auto');
        return key.toString('pkcs8');
      } catch {
        createPrivateKey(privateKeyPem);
        return privateKeyPem;
      }
    } catch {
      return privateKeyPem;
    }
  }

  deriveOpenSshPublicKey(privateKeyPem: string): string {
    try {
      try {
        const key = sshpk.parsePrivateKey(privateKeyPem, 'auto');
        return key.toString('openssh');
      } catch {
        const privateKeyObject = createPrivateKey(privateKeyPem);
        const publicKeyObject = createPublicKey(privateKeyObject);
        const publicKeyDer = publicKeyObject.export({
          type: 'spki',
          format: 'der',
        }) as Buffer;

        return this.convertSpkiDerToOpenSsh(publicKeyDer);
      }
    } catch {
      throw new BadRequestException(
        'Clé privée SSH invalide. Formats acceptés: OpenSSH, PKCS8, PKCS1.',
      );
    }
  }

  convertPublicKeyPemToOpenSsh(publicKeyPem: string): string {
    const publicKeyObject = createPublicKey(publicKeyPem);
    const publicKeyDer = publicKeyObject.export({
      type: 'spki',
      format: 'der',
    }) as Buffer;

    return this.convertSpkiDerToOpenSsh(publicKeyDer);
  }

  convertSpkiDerToOpenSsh(publicKeyDer: Buffer): string {
    const ed25519SpkiPrefix = Buffer.from([
      0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    ]);

    if (
      publicKeyDer.length !== 44 ||
      !publicKeyDer
        .subarray(0, ed25519SpkiPrefix.length)
        .equals(ed25519SpkiPrefix)
    ) {
      throw new BadRequestException('Format de clé publique Ed25519 non supporté');
    }

    const rawPublicKey = publicKeyDer.subarray(ed25519SpkiPrefix.length);
    const keyType = Buffer.from('ssh-ed25519', 'utf8');
    const keyBlob = Buffer.concat([
      this.encodeSshField(keyType),
      this.encodeSshField(rawPublicKey),
    ]);

    return `ssh-ed25519 ${keyBlob.toString('base64')}`;
  }

  encodeSshField(value: Buffer): Buffer {
    const size = Buffer.alloc(4);
    size.writeUInt32BE(value.length, 0);
    return Buffer.concat([size, value]);
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
    } catch (error) {
      throw new InternalServerErrorException(
        `Décryptage a échoué: ${
          error instanceof Error ? error.message : 'erreur inconnue'
        }`,
      );
    }
  }

  private generateSshKeyPair(): { privateKey: string; publicKey: string } {
    return generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });
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
