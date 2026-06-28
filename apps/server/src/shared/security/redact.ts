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
];

export function redactSecrets(value: string): string {
  return REDACTION_RULES.reduce(
    (acc, rule) => acc.replace(rule.pattern, rule.replacement),
    value,
  );
}
