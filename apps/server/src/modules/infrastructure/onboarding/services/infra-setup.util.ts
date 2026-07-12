// Pure helpers extracted from ServerSetupService (P2 split).
// No I/O, no `this` — readiness checks, role labels, timeout budgeting and the
// failure-outcome state machine, all unit-testable in isolation.

import { ServerRunStatus, ServerStatus } from '@prisma/client';
import { redactSecrets } from '../../../../shared/security/redact';
import { SetupRoleKey } from '../../servers/shared/server-setup';

// ─── Readiness checks ───────────────────────────────────────────────────────

export type SetupReadinessChecks = {
  serverActive: boolean;
  serverNotDisabled: boolean;
  sshValidated: boolean;
  sshReachable: boolean;
  authSucceeded: boolean;
  sudoAvailable: boolean;
  noActiveSetup: boolean;
};

/** Turn a readiness checks snapshot into the human-readable blocking reasons. */
export function computeBlockingReasons(checks: SetupReadinessChecks): string[] {
  const blockingReasons: string[] = [];
  if (!checks.serverActive || !checks.serverNotDisabled) {
    blockingReasons.push('Le serveur est désactivé.');
  }
  if (!checks.sshValidated) {
    blockingReasons.push('La validation SSH doit réussir avant le setup.');
  }
  if (!checks.sshReachable || !checks.authSucceeded) {
    blockingReasons.push('Dernière validation SSH absente ou échouée.');
  }
  if (!checks.sudoAvailable) {
    blockingReasons.push(
      'sudo sans mot de passe doit être validé pour lancer le setup de ce serveur.',
    );
  }
  if (!checks.noActiveSetup) {
    blockingReasons.push('Un setup serveur est déjà en cours pour ce VPS.');
  }
  return blockingReasons;
}

// ─── Ansible log → role tracking ────────────────────────────────────────────

/** Extract the role key from an Ansible `TASK [role...]` log line, if known. */
export function parseRoleFromAnsibleLogLine(
  message: string,
  knownRoles: Set<SetupRoleKey>,
): SetupRoleKey | null {
  const match = message.match(/^TASK \[([^\]:]+)(?::|\])/);
  const rawRole = match?.[1]?.trim().replace(/-/g, '_');
  if (!rawRole || !knownRoles.has(rawRole as SetupRoleKey)) {
    return null;
  }
  return rawRole as SetupRoleKey;
}

// ─── Role display names ─────────────────────────────────────────────────────

const ROLE_LABELS: Record<SetupRoleKey, string> = {
  system_base: 'Système de base (apt + paquets essentiels)',
  docker: 'Docker Engine',
  docker_tls: 'Connexion Docker TLS (mTLS 2376)',
  traefik: 'Reverse proxy Traefik (HTTPS Let’s Encrypt)',
  nixpacks: 'Nixpacks (builder d’images)',
  gitlab_runner: 'GitLab Runner',
  firewall: 'Pare-feu UFW',
  fail2ban: 'Fail2ban',
  system_diagnostics: 'Outils de diagnostic système (htop/iotop/sysstat)',
  node_exporter: 'Node Exporter',
  cadvisor: 'cAdvisor',
  prometheus: 'Prometheus',
  grafana: 'Grafana',
  alertmanager: 'Alertmanager',
  loki: 'Loki (logs centralisés)',
  logrotate: 'Rotation des logs',
  swap: 'Swap',
  security_hardening: 'Durcissement sécurité',
};

/** Human label for a preparation role (shown in the task list). */
export function roleDisplayName(role: SetupRoleKey): string {
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ');
}

// ─── Timeout budgeting ──────────────────────────────────────────────────────

const ROLE_BUDGET_MS: Record<string, number> = {
  system_base: 3 * 60_000, // 3 min — apt update + base packages
  docker: 20 * 60_000, // 20 min — download + install + start daemon
  nixpacks: 10 * 60_000, // 10 min
  gitlab_runner: 10 * 60_000, // 10 min
  firewall: 3 * 60_000,
  fail2ban: 3 * 60_000,
  swap: 2 * 60_000,
  system_diagnostics: 5 * 60_000,
  node_exporter: 5 * 60_000,
  cadvisor: 5 * 60_000,
  prometheus: 8 * 60_000,
  grafana: 8 * 60_000,
  alertmanager: 5 * 60_000,
  loki: 5 * 60_000,
  logrotate: 2 * 60_000,
  security_hardening: 3 * 60_000,
};
const DEFAULT_BUDGET_MS = 5 * 60_000;
const BASE_MS = 5 * 60_000; // 5 min base overhead
const MIN_TIMEOUT_MS = 10 * 60_000;
const MAX_TIMEOUT_MS = 120 * 60_000;

/**
 * Resolve the preparation timeout: an explicit env override (>= 1 min) wins,
 * otherwise the budget is derived dynamically from the selected roles
 * (heavier roles like `docker` get more time), capped to [10min, 2h].
 */
export function computeSetupTimeoutMs(
  roles: string[] = [],
  envOverrideMs = 0,
): number {
  if (Number.isFinite(envOverrideMs) && envOverrideMs >= 60_000) {
    return Math.floor(envOverrideMs);
  }
  const budget = roles.reduce(
    (sum, r) => sum + (ROLE_BUDGET_MS[r] ?? DEFAULT_BUDGET_MS),
    BASE_MS,
  );
  return Math.min(Math.max(budget, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

// ─── Failure outcome state machine ──────────────────────────────────────────

export type SetupFailureOutcome = {
  isTimeout: boolean;
  setupStatus:
    | typeof ServerRunStatus.TIMEOUT
    | typeof ServerRunStatus.PARTIAL
    | typeof ServerRunStatus.FAILED;
  serverStatus:
    | typeof ServerStatus.PARTIALLY_PREPARED
    | typeof ServerStatus.PREPARATION_FAILED;
  displayError: string;
  displaySummary: string;
};

/**
 * Derive the preparation/server statuses and display strings for a failed
 * run, from the raw error message and whether any task already succeeded.
 */
export function resolveSetupFailureOutcome(
  rawMessage: string,
  hasSuccessfulTask: boolean,
): SetupFailureOutcome {
  const isTimeout = rawMessage.startsWith('JOB_TIMEOUT_');
  const setupStatus = isTimeout
    ? ServerRunStatus.TIMEOUT
    : hasSuccessfulTask
      ? ServerRunStatus.PARTIAL
      : ServerRunStatus.FAILED;
  const serverStatus = hasSuccessfulTask
    ? ServerStatus.PARTIALLY_PREPARED
    : ServerStatus.PREPARATION_FAILED;

  const displayError = isTimeout
    ? rawMessage.split('\n').slice(1).join('\n').trim() ||
      'Ansible a dépassé le délai configuré.'
    : redactSecrets(rawMessage);

  const displaySummary = isTimeout
    ? hasSuccessfulTask
      ? 'Timeout: certains rôles ont réussi avant que le délai soit atteint.'
      : "Timeout: aucun rôle n'a pu terminer dans le délai imparti."
    : hasSuccessfulTask
      ? "Setup partiel: certains rôles ont réussi avant l'échec."
      : 'Setup échoué.';

  return { isTimeout, setupStatus, serverStatus, displayError, displaySummary };
}
