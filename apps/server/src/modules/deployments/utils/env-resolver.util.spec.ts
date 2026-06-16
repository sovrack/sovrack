import {
  EnvLevel,
  resolveEnvDetailed,
  resolveEnvVars,
  toEnvStrings,
} from './env-resolver.util';

/**
 * Helper to build the 3-level input quickly. Any level can be omitted.
 */
function levels(
  service?: Partial<Omit<EnvLevel, 'levelName'>>,
  environment?: Partial<Omit<EnvLevel, 'levelName'>>,
  serviceEnvironment?: Partial<Omit<EnvLevel, 'levelName'>>,
): EnvLevel[] {
  return [
    {
      levelName: 'service',
      env: service?.env ?? null,
      secretsEnv: service?.secretsEnv ?? null,
    },
    {
      levelName: 'environment',
      env: environment?.env ?? null,
      secretsEnv: environment?.secretsEnv ?? null,
    },
    {
      levelName: 'serviceEnvironment',
      env: serviceEnvironment?.env ?? null,
      secretsEnv: serviceEnvironment?.secretsEnv ?? null,
    },
  ];
}

describe('resolveEnvVars / resolveEnvDetailed', () => {
  // Cas 1 : merge basique 3 niveaux, ServiceEnv gagne
  it('cas 1 — merges three levels, serviceEnvironment wins on collision', () => {
    const res = resolveEnvDetailed(
      levels(
        { env: '{"A":"1","B":"svc"}' },
        { env: '{"B":"env"}' },
        { env: '{"B":"se"}' },
      ),
    );
    const map = Object.fromEntries(res.entries.map((e) => [e.key, e]));
    expect(map.A.value).toBe('1');
    expect(map.B.value).toBe('se');
    expect(map.B.origin).toBe('serviceEnvironment');
    expect(res.warnings).toEqual([]);
  });

  // Cas 2 : clé absente au niveau Service → héritée d'Environment
  it('cas 2 — inherits a key from environment when absent at service', () => {
    const res = resolveEnvDetailed(
      levels({ env: '{}' }, { env: '{"C":"fromEnv"}' }, { env: '{}' }),
    );
    const c = res.entries.find((e) => e.key === 'C');
    expect(c?.value).toBe('fromEnv');
    expect(c?.origin).toBe('environment');
  });

  // Cas 3 : clé absente partout → absente du résultat
  it('cas 3 — absent key is absent from the result (no empty key)', () => {
    const res = resolveEnvVars(levels({ env: '{"A":"1"}' }));
    expect(res.vars).toEqual({ A: '1' });
    expect(Object.keys(res.vars)).not.toContain('Z');
  });

  // Cas 4 : JSON malformé au niveau Service → erreur loggée + niveau ignoré
  it('cas 4 — malformed JSON at service is reported and skipped', () => {
    const res = resolveEnvDetailed(
      levels({ env: '{bad json' }, { env: '{"A":"e"}' }),
    );
    expect(res.entries.find((e) => e.key === 'A')?.value).toBe('e');
    expect(res.warnings.some((w) => w.startsWith('service.env'))).toBe(true);
  });

  // Cas 5 : JSON malformé au niveau Environment → erreur loggée + niveau ignoré
  it('cas 5 — malformed JSON at environment is reported and skipped', () => {
    const res = resolveEnvDetailed(
      levels({ env: '{"A":"svc"}' }, { env: 'not-json' }),
    );
    expect(res.entries.find((e) => e.key === 'A')?.value).toBe('svc');
    expect(res.warnings.some((w) => w.startsWith('environment.env'))).toBe(
      true,
    );
  });

  // Cas 6 : JSON malformé au niveau ServiceEnvironment → niveaux précédents utilisés (dégradation gracieuse)
  it('cas 6 — malformed JSON at serviceEnvironment degrades gracefully', () => {
    const res = resolveEnvDetailed(
      levels({ env: '{"A":"svc"}' }, {}, { env: '{bad' }),
    );
    expect(res.entries.find((e) => e.key === 'A')?.value).toBe('svc');
    expect(
      res.warnings.some((w) => w.startsWith('serviceEnvironment.env')),
    ).toBe(true);
  });

  // Cas 7 : un secret n'est PAS écrasé par un env non-secret d'un niveau supérieur → le secret GAGNE
  it('cas 7 — a secret is protected from override by a non-secret env at a higher level', () => {
    const res = resolveEnvDetailed(
      levels({ secretsEnv: '{"S":"secretval"}' }, {}, { env: '{"S":"plain"}' }),
    );
    const s = res.entries.find((e) => e.key === 'S');
    expect(s?.value).toBe('secretval');
    expect(s?.isSecret).toBe(true);
    expect(s?.origin).toBe('service');
  });

  // Cas 8 : secretsEnv vide ("{}") → aucune variable secrète, pas d'erreur
  it('cas 8 — empty secretsEnv yields no secret vars and no warning', () => {
    const res = resolveEnvDetailed(
      levels({ env: '{"A":"1"}', secretsEnv: '{}' }),
    );
    expect(res.entries.filter((e) => e.isSecret)).toHaveLength(0);
    expect(res.warnings).toEqual([]);
  });

  // Cas 9 : secretsEnv null/undefined → traité comme "{}", pas d'erreur
  it('cas 9 — null/undefined secretsEnv is treated as {} with no warning', () => {
    const res = resolveEnvDetailed(
      levels({ env: '{"A":"1"}', secretsEnv: null }),
    );
    expect(res.warnings).toEqual([]);
    expect(res.entries.find((e) => e.key === 'A')?.isSecret).toBe(false);
  });

  // Cas 10 : même clé dans env ET secretsEnv du même niveau → secretsEnv gagne
  it('cas 10 — within a level, secretsEnv overrides env on the same key', () => {
    const res = resolveEnvDetailed(
      levels({ env: '{"K":"plain"}', secretsEnv: '{"K":"secret"}' }),
    );
    const k = res.entries.find((e) => e.key === 'K');
    expect(k?.value).toBe('secret');
    expect(k?.isSecret).toBe(true);
  });

  it('toEnvStrings — produces KEY=VALUE pairs', () => {
    const { vars } = resolveEnvVars(levels({ env: '{"A":"1","B":"2"}' }));
    expect(toEnvStrings(vars).sort()).toEqual(['A=1', 'B=2']);
  });
});
