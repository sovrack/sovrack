import { Test, TestingModule } from '@nestjs/testing';
import { GitlabCryptoService } from './gitlab-crypto.service';
import { CryptoService } from '../../../core/crypto/crypto.service';

describe('GitlabCryptoService', () => {
  let service: GitlabCryptoService;

  beforeEach(async () => {
    process.env.CONFIG_SECRET =
      'this-is-a-test-secret-key-that-is-at-least-32-char';

    const module: TestingModule = await Test.createTestingModule({
      providers: [GitlabCryptoService, CryptoService],
    }).compile();

    service = module.get<GitlabCryptoService>(GitlabCryptoService);
  });

  afterEach(() => {
    delete process.env.CONFIG_SECRET;
  });

  describe('encrypt/decrypt round-trip', () => {
    it('should decrypt to exact same plaintext', () => {
      const plaintext = 'glpat-xxxxxxxxxxxxx';

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decryptConfigToken(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle gitlab deploy token format', () => {
      const deployToken = 'gldt-xxxxxxxxxxxx1234';

      const encrypted = service.encrypt(deployToken);
      const decrypted = service.decryptConfigToken(encrypted);

      expect(decrypted).toBe(deployToken);
    });

    it('should handle registry-related token format', () => {
      const registryToken = 'gr-xxxxxxxxxx';

      const encrypted = service.encrypt(registryToken);
      const decrypted = service.decryptConfigToken(encrypted);

      expect(decrypted).toBe(registryToken);
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const plaintext = 'glpat-test-token';

      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      expect(service.decryptConfigToken(encrypted1)).toBe(plaintext);
      expect(service.decryptConfigToken(encrypted2)).toBe(plaintext);
    });

    it('should throw on corrupted ciphertext', () => {
      expect(() => {
        service.decryptConfigToken('invalid-base64!!!');
      }).toThrow();
    });

    it('should throw when CONFIG_SECRET is too short', () => {
      process.env.CONFIG_SECRET = 'short';

      expect(() => {
        service.encrypt('test');
      }).toThrow('CONFIG_SECRET doit contenir au moins 32 caractères');
    });

    it('should throw when CONFIG_SECRET is missing', () => {
      delete process.env.CONFIG_SECRET;

      expect(() => {
        service.encrypt('test');
      }).toThrow('CONFIG_SECRET doit contenir au moins 32 caractères');
    });
  });

  describe('Token Validation Patterns', () => {
    it('should handle long complex tokens', () => {
      const longToken =
        'glpat-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

      const encrypted = service.encrypt(longToken);
      const decrypted = service.decryptConfigToken(encrypted);

      expect(decrypted).toBe(longToken);
    });

    it('should handle tokens with special characters', () => {
      const specialToken = 'gldt-_-.!@#$%^&*()1234567890';

      const encrypted = service.encrypt(specialToken);
      const decrypted = service.decryptConfigToken(encrypted);

      expect(decrypted).toBe(specialToken);
    });

    it('should handle empty string (unusual but valid edge case)', () => {
      const emptyString = '';

      const encrypted = service.encrypt(emptyString);
      const decrypted = service.decryptConfigToken(encrypted);

      expect(decrypted).toBe(emptyString);
    });
  });

  describe('Consistency across multiple calls', () => {
    it('should decrypt same ciphertext consistently', () => {
      const plaintext = 'glpat-test-token-123';
      const encrypted = service.encrypt(plaintext);

      const decrypted1 = service.decryptConfigToken(encrypted);
      const decrypted2 = service.decryptConfigToken(encrypted);
      const decrypted3 = service.decryptConfigToken(encrypted);

      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
      expect(decrypted3).toBe(plaintext);
    });
  });
});
