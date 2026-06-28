import * as bcrypt from 'bcrypt';
import { PasswordHasher } from './password-hasher.service';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('hashes in argon2id (prefix $argon2id) and verifies the right password', async () => {
    const hash = await hasher.hash('s3cret!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(hash, 's3cret!')).toBe(true);
    expect(await hasher.verify(hash, 'wrong')).toBe(false);
  });

  it('verifies legacy bcrypt hashes transparently (soft migration)', async () => {
    const legacy = await bcrypt.hash('old-pass', 10);
    expect(legacy.startsWith('$2')).toBe(true);
    expect(await hasher.verify(legacy, 'old-pass')).toBe(true);
    expect(await hasher.verify(legacy, 'nope')).toBe(false);
  });

  it('needsRehash is true for bcrypt, false for argon2id', async () => {
    const legacy = await bcrypt.hash('x', 10);
    const modern = await hasher.hash('x');
    expect(hasher.needsRehash(legacy)).toBe(true);
    expect(hasher.needsRehash(modern)).toBe(false);
  });

  it('returns false (never throws) on a malformed hash', async () => {
    expect(await hasher.verify('not-a-hash', 'x')).toBe(false);
  });
});
