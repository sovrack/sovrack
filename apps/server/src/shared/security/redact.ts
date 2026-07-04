/**
 * Redacts secrets from arbitrary log/output strings before they are persisted
 * or streamed to clients. Single source of truth shared by the Ansible runner
 * and the server-preparation orchestrator so the rule set never drifts.
 *
 * Covered patterns:
 * - `--private-key <value>`         (SSH key paths/material on command lines)
 * - `registration-token <value>`    (GitLab Runner registration)
 * - `token=` / `password=` / `secret=` / `api_key=` (query strings / env-style)
 * - `Bearer <value>` / `Authorization: <value>` (HTTP auth headers)
 * - PEM blocks (private keys AND certificates) — covers docker_tls material
 *   that could surface in an Ansible error dump (variable dumps JSON-escape
 *   newlines, so a whole PEM can sit on ONE line as `-----BEGIN…\n…`); the
 *   pattern therefore tolerates both real and escaped newlines, and redacts
 *   to the END marker or end-of-string if truncated.
 */
const REDACTION_RULES: { pattern: RegExp; replacement: string }[] = [
  { pattern: /(--private-key\s+)\S+/gi, replacement: '$1[redacted]' },
  { pattern: /(registration-token\s+)\S+/gi, replacement: '$1[redacted]' },
  {
    pattern: /((?:api[_-]?key|token|password|secret)=)\S+/gi,
    replacement: '$1[redacted]',
  },
  { pattern: /(bearer\s+)\S+/gi, replacement: '$1[redacted]' },
  // Consume the whole value after `Authorization:` (scheme + token), line-safe.
  { pattern: /(authorization:\s*).+/gi, replacement: '$1[redacted]' },
  // Private keys: highest sensitivity — redact the whole block, even truncated.
  {
    pattern:
      /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END[A-Z ]*PRIVATE KEY-----|$)/g,
    replacement: '[redacted-private-key]',
  },
  // Certificates: not secret per se, but redacting keeps prep logs clean and
  // avoids any partial-material reconstruction from log streams.
  {
    pattern:
      /-----BEGIN CERTIFICATE-----[\s\S]*?(?:-----END CERTIFICATE-----|$)/g,
    replacement: '[redacted-certificate]',
  },
];

export function redactSecrets(value: string): string {
  return REDACTION_RULES.reduce(
    (acc, rule) => acc.replace(rule.pattern, rule.replacement),
    value,
  );
}
