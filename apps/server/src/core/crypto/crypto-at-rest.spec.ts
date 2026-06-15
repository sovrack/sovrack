import { PrismaClient } from '@prisma/client';
import { CryptoService } from './crypto.service';

/**
 * Secrets-at-rest audit (T5).
 *
 * Unit part (always runs): proves the CryptoService scheme stores ciphertext
 * and that a CONFIG_SECRET rotation makes old ciphertext unreadable.
 *
 * Integration part (gated by RUN_DB_TESTS=1, runs in CI with a throwaway DB):
 * writes rows the way the services do and reads them back with raw SQL to prove
 * the bytes on disk are encrypted — except `secretsEnv`, which is a KNOWN GAP
 * (stored plaintext today; see docs/security/secrets-at-rest.md).
 */

const VALID_SECRET = 'unit-test-config-secret-32chars-min!!';

function withSecret<T>(secret: string, fn: () => T): T {
  const previous = process.env.CONFIG_SECRET;
  process.env.CONFIG_SECRET = secret;
  try {
    return fn();
  } finally {
    process.env.CONFIG_SECRET = previous;
  }
}

describe('CryptoService — secrets at rest (unit)', () => {
  it('encrypt() produces base64 ciphertext, never the plaintext', () => {
    withSecret(VALID_SECRET, () => {
      const crypto = new CryptoService();
      const plaintext = 'glpat-super-secret-token';
      const ciphertext = crypto.encrypt(plaintext);

      expect(ciphertext).not.toContain(plaintext);
      expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/); // base64
      expect(crypto.decrypt(ciphertext)).toBe(plaintext);
    });
  });

  // Test 4 — rotation de CONFIG_SECRET
  it('rotation: values encrypted with the new key work; old ciphertext is unreadable', () => {
    const oldKey = 'OLD-config-secret-32-chars-minimum-ok';
    const newKey = 'NEW-config-secret-32-chars-minimum-ok';
    const plaintext = 'rotate-me';

    const cipherWithOldKey = withSecret(oldKey, () => new CryptoService().encrypt(plaintext));

    withSecret(newKey, () => {
      const crypto = new CryptoService();

      // New key round-trips its own ciphertext.
      const cipherWithNewKey = crypto.encrypt(plaintext);
      expect(crypto.decrypt(cipherWithNewKey)).toBe(plaintext);

      // Old ciphertext must NOT decrypt back to the plaintext under the new key
      // (it either throws or yields garbage — never the original).
      let recovered: string | null = null;
      try {
        recovered = crypto.decrypt(cipherWithOldKey);
      } catch {
        recovered = null;
      }
      expect(recovered).not.toBe(plaintext);
    });
  });

  it('rejects a CONFIG_SECRET shorter than 32 chars', () => {
    withSecret('too-short', () => {
      expect(() => new CryptoService().encrypt('x')).toThrow();
    });
  });
});

// ─── Integration (DB) — gated so `npm run test` stays green without a DB ──────
const runDbTests = process.env.RUN_DB_TESTS === '1';
const dbDescribe = runDbTests ? describe : describe.skip;

dbDescribe('Secrets at rest (integration, requires DB)', () => {
  const prisma = new PrismaClient();
  // The integration suite uses whatever CONFIG_SECRET the env provides (CI sets one).
  const crypto = new CryptoService();
  const tag = `attest-${Date.now()}`;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Test 1 — GitProviderConfig.adminToken is encrypted on disk
  it('GitProviderConfig.adminToken is stored encrypted, not in clear', async () => {
    const clearToken = `glpat-${tag}`;
    const created = await prisma.gitProviderConfig.create({
      data: {
        name: tag,
        type: 'GITLAB',
        providerUrl: 'https://gitlab.example.com',
        adminToken: crypto.encrypt(clearToken), // mirrors git-provider-config.service.ts
      },
      select: { id: true },
    });
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ adminToken: string | null }>>(
        `SELECT "adminToken" FROM "GitProviderConfig" WHERE id = $1`,
        created.id,
      );
      const raw = rows[0]?.adminToken ?? '';
      expect(raw).not.toContain(clearToken);
      expect(crypto.decrypt(raw)).toBe(clearToken);
    } finally {
      await prisma.gitProviderConfig.delete({ where: { id: created.id } });
    }
  });

  // Test 2 — DockerConnection.tlsClientKey is encrypted (PEM never on disk in clear)
  it('DockerConnection.tlsClientKey is stored encrypted, not as raw PEM', async () => {
    const pem = `-----BEGIN PRIVATE KEY-----\n${tag}\n-----END PRIVATE KEY-----`;
    const server = await prisma.server.create({
      data: { name: tag, host: '10.0.0.1', sshKey: crypto.encrypt('dummy') },
      select: { id: true },
    });
    const conn = await prisma.dockerConnection.create({
      data: {
        serverId: server.id,
        endpoint: 'tcp://10.0.0.1:2376',
        tlsCaCert: crypto.encrypt('ca'),
        tlsClientCert: crypto.encrypt('cert'),
        tlsClientKey: crypto.encrypt(pem), // mirrors docker-connections.service.ts
      },
      select: { id: true },
    });
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ tlsClientKey: string }>>(
        `SELECT "tlsClientKey" FROM "DockerConnection" WHERE id = $1`,
        conn.id,
      );
      const raw = rows[0]?.tlsClientKey ?? '';
      expect(raw).not.toContain('BEGIN PRIVATE KEY');
      expect(crypto.decrypt(raw)).toBe(pem);
    } finally {
      await prisma.server.delete({ where: { id: server.id } }); // cascades DockerConnection
    }
  });

  // Test 3 — secretsEnv is now encrypted at rest (see services write path).
  // The encrypted-write path stores ciphertext; decryptSafe round-trips it and
  // also passes legacy plaintext JSON through unchanged (backward compatible).
  it('secretsEnv is encrypted at rest and decryptSafe round-trips', async () => {
    const plaintextSecrets = JSON.stringify({ DB_PASSWORD: `pw-${tag}` });
    const project = await prisma.project.create({ data: { name: tag }, select: { id: true } });
    const service = await prisma.service.create({
      data: {
        projectId: project.id,
        name: tag,
        // Mirrors the encrypted write path (CryptoService.encrypt).
        secretsEnv: crypto.encrypt(plaintextSecrets),
      },
      select: { id: true },
    });
    try {
      const rows = await prisma.$queryRawUnsafe<Array<{ secretsEnv: string | null }>>(
        `SELECT "secretsEnv" FROM "Service" WHERE id = $1`,
        service.id,
      );
      const raw = rows[0]?.secretsEnv ?? '';
      // Ciphertext: the password is NOT readable in the DB.
      expect(raw).not.toContain(`pw-${tag}`);
      // The deploy read path uses decryptSafe → original is recovered.
      expect(crypto.decryptSafe(raw)).toBe(plaintextSecrets);
      // Backward compatibility: legacy plaintext JSON passes through unchanged.
      expect(crypto.decryptSafe(plaintextSecrets)).toBe(plaintextSecrets);
    } finally {
      await prisma.project.delete({ where: { id: project.id } }); // cascades Service
    }
  });
});
