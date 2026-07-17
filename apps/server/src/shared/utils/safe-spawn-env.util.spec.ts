import { buildSafeSpawnEnv } from './safe-spawn-env.util';

describe('buildSafeSpawnEnv', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('carries through allow-listed keys present in process.env', () => {
    process.env.PATH = '/usr/bin:/bin';
    process.env.HOME = '/home/deployautomation';
    const env = buildSafeSpawnEnv();
    expect(env.PATH).toBe('/usr/bin:/bin');
    expect(env.HOME).toBe('/home/deployautomation');
  });

  it('does not leak arbitrary app secrets from process.env', () => {
    process.env.DATABASE_URL = 'postgres://secret';
    process.env.JWT_SECRET = 'super-secret';
    const env = buildSafeSpawnEnv();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.JWT_SECRET).toBeUndefined();
  });

  it('merges caller-supplied extras on top of the allow-listed base', () => {
    const env = buildSafeSpawnEnv({ GIT_ASKPASS_PASS: 'token123' });
    expect(env.GIT_ASKPASS_PASS).toBe('token123');
  });

  it('omits undefined extras instead of writing the literal "undefined"', () => {
    const env = buildSafeSpawnEnv({ ANSIBLE_CONFIG: undefined });
    expect('ANSIBLE_CONFIG' in env).toBe(false);
  });
});
