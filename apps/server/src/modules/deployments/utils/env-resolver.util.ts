/**
 * Strict, pure resolver for the 3-level environment merge used at deploy time.
 *
 * Precedence (documented contract — covered by env-resolver.util.spec.ts):
 *   1. Levels are merged in array order; a later level overrides an earlier one
 *      on key collision  (service < environment < serviceEnvironment).
 *   2. Within a single level, the secrets map (`secretsEnv`) overrides the
 *      non-secret map (`env`) on key collision.
 *   3. A value already marked secret is PROTECTED: a later *non-secret* env
 *      cannot override it — only another secret (or nothing) can. This prevents
 *      a higher-level plain variable from silently downgrading/clobbering a
 *      secret set lower down.
 *   4. Malformed / non-object JSON at any source produces a non-fatal WARNING
 *      (`"<levelName>.<env|secretsEnv>: <reason>"`); that source is skipped and
 *      every other source is still merged (graceful degradation).
 *   5. null / undefined / empty string is treated as "{}" (no vars, no warning).
 *
 * This replaces the previous `catch {}`-swallowing logic that made a malformed
 * `secretsEnv` disappear silently and start a container without its secrets.
 *
 * NOTE: secretsEnv is currently stored as plaintext JSON by the write path
 * (no CryptoService.encrypt() on write, no decrypt here) despite the schema
 * comment. The caller passes whatever string is persisted; this util only
 * parses it. If/when at-rest encryption of secretsEnv is implemented, decrypt
 * BEFORE calling this util (the `secretsEnv` field is expected to be plaintext
 * JSON here).
 */

export type EnvOrigin = 'service' | 'environment' | 'serviceEnvironment';

export interface EnvLevel {
  levelName: EnvOrigin;
  /** JSON object of non-secret variables, or null/empty. */
  env: string | null;
  /** JSON object of secret variables (already decrypted), or null/empty. */
  secretsEnv: string | null;
}

export interface ResolvedEnvEntry {
  key: string;
  value: string;
  origin: EnvOrigin;
  isSecret: boolean;
}

export interface ResolvedEnvDetailed {
  entries: ResolvedEnvEntry[];
  warnings: string[];
}

export interface ResolvedEnv {
  vars: Record<string, string>;
  warnings: string[];
}

type Resolved = { value: string; origin: EnvOrigin; isSecret: boolean };

/**
 * Parse one JSON source into a flat string map. Returns `null` (and pushes a
 * warning) when the source is present but malformed or not a plain object.
 * Empty/absent sources return `{}` with no warning.
 */
function parseSource(
  raw: string | null | undefined,
  label: string,
  warnings: string[],
): Record<string, string> | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'invalid JSON';
    warnings.push(`${label}: ${reason}`);
    return null;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    warnings.push(`${label}: expected a JSON object`);
    return null;
  }

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'string') {
      out[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = String(value);
    } else {
      // null / nested object / array — not a valid env value.
      warnings.push(`${label}: key "${key}" has a non-scalar value, skipped`);
    }
  }
  return out;
}

/**
 * Resolve the merged environment with per-key provenance (origin + isSecret)
 * and a list of non-fatal warnings. Never throws.
 */
export function resolveEnvDetailed(levels: EnvLevel[]): ResolvedEnvDetailed {
  const warnings: string[] = [];
  const resolved = new Map<string, Resolved>();

  const apply = (
    source: Record<string, string> | null,
    origin: EnvOrigin,
    isSecret: boolean,
  ): void => {
    if (!source) {
      return;
    }
    for (const [key, value] of Object.entries(source)) {
      const existing = resolved.get(key);
      // Rule 3: a non-secret value must not override an existing secret.
      if (existing && existing.isSecret && !isSecret) {
        continue;
      }
      resolved.set(key, { value, origin, isSecret });
    }
  };

  for (const level of levels) {
    // Non-secrets first, then secrets, so secrets win within the same level.
    apply(parseSource(level.env, `${level.levelName}.env`, warnings), level.levelName, false);
    apply(
      parseSource(level.secretsEnv, `${level.levelName}.secretsEnv`, warnings),
      level.levelName,
      true,
    );
  }

  const entries: ResolvedEnvEntry[] = Array.from(resolved.entries()).map(([key, r]) => ({
    key,
    value: r.value,
    origin: r.origin,
    isSecret: r.isSecret,
  }));

  return { entries, warnings };
}

/**
 * Flat `{ vars, warnings }` form used by the deploy executor.
 */
export function resolveEnvVars(levels: EnvLevel[]): ResolvedEnv {
  const detailed = resolveEnvDetailed(levels);
  const vars: Record<string, string> = {};
  for (const entry of detailed.entries) {
    vars[entry.key] = entry.value;
  }
  return { vars, warnings: detailed.warnings };
}

/**
 * Convert a resolved var map to the `KEY=VALUE` array Docker expects.
 */
export function toEnvStrings(vars: Record<string, string>): string[] {
  return Object.entries(vars).map(([key, value]) => `${key}=${value}`);
}
