import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import * as CryptoJS from 'crypto-js';
import { ServersCryptoService } from './servers-crypto.service';

describe('ServersCryptoService', () => {
  let service: ServersCryptoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServersCryptoService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'CONFIG_SECRET') {
                return 'this-is-a-test-secret-key-that-is-at-least-32-char';
              }
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ServersCryptoService>(ServersCryptoService);
  });

  describe('resolveSshMaterial', () => {
    it('should return privateKey and publicKey structure', () => {
      const result = service.resolveSshMaterial();

      expect(result).toHaveProperty('privateKey');
      expect(result).toHaveProperty('publicKey');
      expect(typeof result.privateKey).toBe('string');
      expect(typeof result.publicKey).toBe('string');
    });

    it('should generate OpenSSH format private key', () => {
      const result = service.resolveSshMaterial();

      expect(result.privateKey).toContain('OPENSSH PRIVATE KEY');
    });

    it('should generate Ed25519 public key', () => {
      const result = service.resolveSshMaterial();

      expect(result.publicKey).toContain('ssh-ed25519');
    });

    it('should use provided private key when supplied', () => {
      // Generate a valid key first to use as custom key
      const validKeyPair = service.resolveSshMaterial();
      const customKey = validKeyPair.privateKey;

      const result = service.resolveSshMaterial(customKey);

      expect(result.privateKey).toContain('OPENSSH PRIVATE KEY');
      // Public key should be derived from provided private key
      expect(result.publicKey).toBeDefined();
      expect(result.publicKey).toContain('ssh-ed25519');
    });

    it('should generate different keys on each call', () => {
      const result1 = service.resolveSshMaterial();
      const result2 = service.resolveSshMaterial();

      expect(result1.privateKey).not.toBe(result2.privateKey);
      expect(result1.privateKey).toContain('OPENSSH PRIVATE KEY');
      expect(result2.privateKey).toContain('OPENSSH PRIVATE KEY');
    });
  });

  describe('encrypt/decrypt round-trip', () => {
    it('should decrypt to exact same plaintext', () => {
      const plaintext = 'test-secret-data-12345';

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle SSH keys during encryption', () => {
      const keyPair = service.resolveSshMaterial();
      const encrypted = service.encrypt(keyPair.privateKey);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(keyPair.privateKey);
      expect(decrypted).toContain('PRIVATE KEY');
    });

    it('should produce different ciphertexts due to random IV', () => {
      const plaintext = 'test-data';

      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      // Different IVs = different ciphertexts
      expect(encrypted1).not.toBe(encrypted2);
      // But same plaintext
      expect(service.decrypt(encrypted1)).toBe(plaintext);
      expect(service.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should throw on corrupted ciphertext', () => {
      expect(() => {
        service.decrypt('invalid-base64!!!');
      }).toThrow();
    });

    it('should decrypt legacy CryptoJS ciphertexts', () => {
      const plaintext = 'legacy-secret-data';
      const secret = 'this-is-a-test-secret-key-that-is-at-least-32-char';
      const legacyEncrypted = CryptoJS.AES.encrypt(
        plaintext,
        secret,
      ).toString();

      const decrypted = service.decrypt(legacyEncrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('deriveOpenSshPublicKey', () => {
    it('should derive public key from private key', () => {
      const keyPair = service.resolveSshMaterial();
      const derived = service.deriveOpenSshPublicKey(keyPair.privateKey);

      expect(derived).toContain('ssh-ed25519');
    });

    it('should throw on invalid private key', () => {
      expect(() => {
        service.deriveOpenSshPublicKey('invalid-key-format');
      }).toThrow();
    });
  });

  describe('normalizePrivateKeyFormat', () => {
    it('should return valid OpenSSH key unchanged', () => {
      const keyPair = service.resolveSshMaterial();
      const result = service.normalizePrivateKeyFormat(keyPair.privateKey);

      expect(result).toContain('OPENSSH PRIVATE KEY');
    });

    it('should normalize PKCS8 key to OpenSSH format', () => {
      const { privateKey: pkcs8Key } = generateKeyPairSync('ed25519', {
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      });

      const result = service.normalizePrivateKeyFormat(pkcs8Key);

      expect(result).toContain('OPENSSH PRIVATE KEY');
    });

    it('should throw on invalid key format', () => {
      expect(() => {
        service.normalizePrivateKeyFormat('not-a-valid-key');
      }).toThrow();
    });
  });
});
