/**
 * Restricted env for spawning trusted CLI tools (git, ansible-playbook).
 *
 * Full `...process.env` inheritance leaks app secrets (DATABASE_URL,
 * JWT_SECRET, encryption keys, …) into the child process — a risk if the
 * tool's own verbose/debug output ever echoes its env, or if a compromised
 * binary reads it. Only the variables these tools actually need to run
 * (locate binaries, resolve $HOME, format output) are passed through.
 */
const ALLOWED_ENV_KEYS = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'TMPDIR',
  'TZ',
] as const;

export function buildSafeSpawnEnv(
  extra: Record<string, string | undefined> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ALLOWED_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}
