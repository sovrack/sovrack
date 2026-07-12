import { ServerRunStatus, ServerStatus } from '@prisma/client';
import { SetupRoleKey } from '../../servers/shared/server-setup';
import {
  computeBlockingReasons,
  computeSetupTimeoutMs,
  parseRoleFromAnsibleLogLine,
  resolveSetupFailureOutcome,
  roleDisplayName,
  type SetupReadinessChecks,
} from './infra-setup.util';

function checks(
  overrides: Partial<SetupReadinessChecks> = {},
): SetupReadinessChecks {
  return {
    serverActive: true,
    serverNotDisabled: true,
    sshValidated: true,
    sshReachable: true,
    authSucceeded: true,
    sudoAvailable: true,
    noActiveSetup: true,
    ...overrides,
  };
}

describe('computeBlockingReasons', () => {
  it('returns no reasons when everything is ready', () => {
    expect(computeBlockingReasons(checks())).toEqual([]);
  });

  it('flags a disabled server', () => {
    expect(
      computeBlockingReasons(checks({ serverNotDisabled: false })),
    ).toEqual(['Le serveur est désactivé.']);
  });

  it('flags a missing SSH validation', () => {
    expect(computeBlockingReasons(checks({ sshValidated: false }))).toEqual([
      'La validation SSH doit réussir avant le setup.',
    ]);
  });

  it('flags an unreachable or failed SSH auth', () => {
    expect(computeBlockingReasons(checks({ sshReachable: false }))).toEqual([
      'Dernière validation SSH absente ou échouée.',
    ]);
    expect(computeBlockingReasons(checks({ authSucceeded: false }))).toEqual([
      'Dernière validation SSH absente ou échouée.',
    ]);
  });

  it('flags missing passwordless sudo', () => {
    expect(computeBlockingReasons(checks({ sudoAvailable: false }))).toEqual([
      'sudo sans mot de passe doit être validé pour lancer le setup de ce serveur.',
    ]);
  });

  it('flags an already-running preparation', () => {
    expect(computeBlockingReasons(checks({ noActiveSetup: false }))).toEqual([
      'Un setup serveur est déjà en cours pour ce VPS.',
    ]);
  });

  it('accumulates every applicable reason', () => {
    expect(
      computeBlockingReasons(
        checks({
          serverActive: false,
          sshValidated: false,
          sudoAvailable: false,
          noActiveSetup: false,
        }),
      ),
    ).toHaveLength(4);
  });
});

describe('parseRoleFromAnsibleLogLine', () => {
  const knownRoles = new Set<SetupRoleKey>(['system_base', 'docker']);

  it('extracts a known role from a colon-suffixed TASK line', () => {
    expect(
      parseRoleFromAnsibleLogLine(
        'TASK [docker : install package] ***',
        knownRoles,
      ),
    ).toBe('docker');
  });

  it('extracts a known role from a bracket-only TASK line', () => {
    expect(parseRoleFromAnsibleLogLine('TASK [system_base]', knownRoles)).toBe(
      'system_base',
    );
  });

  it('normalizes hyphens to underscores before matching', () => {
    expect(
      parseRoleFromAnsibleLogLine('TASK [system-base : step] ***', knownRoles),
    ).toBe('system_base');
  });

  it('returns null for an unknown role', () => {
    expect(
      parseRoleFromAnsibleLogLine('TASK [nginx : step] ***', knownRoles),
    ).toBeNull();
  });

  it('returns null for a non-TASK log line', () => {
    expect(
      parseRoleFromAnsibleLogLine('PLAY [all] ***', knownRoles),
    ).toBeNull();
  });
});

describe('roleDisplayName', () => {
  it('returns the French label for a known role', () => {
    expect(roleDisplayName('docker')).toBe('Docker Engine');
  });

  it('falls back to a humanized key for an unknown role', () => {
    expect(roleDisplayName('made_up_role' as SetupRoleKey)).toBe(
      'made up role',
    );
  });
});

describe('computeSetupTimeoutMs', () => {
  it('uses the env override when it is at least 1 minute', () => {
    expect(computeSetupTimeoutMs(['docker'], 90_000)).toBe(90_000);
  });

  it('ignores an env override below 1 minute', () => {
    expect(computeSetupTimeoutMs([], 1_000)).toBe(10 * 60_000);
  });

  it('derives the budget dynamically from selected roles', () => {
    // base 5min + system_base 3min + docker 20min = 28min
    expect(computeSetupTimeoutMs(['system_base', 'docker'], 0)).toBe(
      28 * 60_000,
    );
  });

  it('applies the default per-role budget for unlisted roles', () => {
    expect(computeSetupTimeoutMs(['some_unknown_role'], 0)).toBe(10 * 60_000);
  });

  it('clamps to the minimum timeout for a tiny role set', () => {
    expect(computeSetupTimeoutMs([], 0)).toBe(10 * 60_000);
  });

  it('clamps to the maximum timeout for an oversized role set', () => {
    const manyRoles = Array.from({ length: 30 }, () => 'docker');
    expect(computeSetupTimeoutMs(manyRoles, 0)).toBe(120 * 60_000);
  });
});

describe('resolveSetupFailureOutcome', () => {
  it('handles a timeout with no successful task', () => {
    const outcome = resolveSetupFailureOutcome(
      'JOB_TIMEOUT_2024\nAnsible did not respond',
      false,
    );
    expect(outcome).toEqual({
      isTimeout: true,
      setupStatus: ServerRunStatus.TIMEOUT,
      serverStatus: ServerStatus.PREPARATION_FAILED,
      displayError: 'Ansible did not respond',
      displaySummary:
        "Timeout: aucun rôle n'a pu terminer dans le délai imparti.",
    });
  });

  it('handles a timeout with at least one successful task', () => {
    const outcome = resolveSetupFailureOutcome('JOB_TIMEOUT_2024', true);
    expect(outcome).toEqual({
      isTimeout: true,
      setupStatus: ServerRunStatus.TIMEOUT,
      serverStatus: ServerStatus.PARTIALLY_PREPARED,
      displayError: 'Ansible a dépassé le délai configuré.',
      displaySummary:
        'Timeout: certains rôles ont réussi avant que le délai soit atteint.',
    });
  });

  it('handles a non-timeout failure with no successful task', () => {
    const outcome = resolveSetupFailureOutcome('boom', false);
    expect(outcome).toEqual({
      isTimeout: false,
      setupStatus: ServerRunStatus.FAILED,
      serverStatus: ServerStatus.PREPARATION_FAILED,
      displayError: 'boom',
      displaySummary: 'Setup échoué.',
    });
  });

  it('handles a non-timeout failure with at least one successful task', () => {
    const outcome = resolveSetupFailureOutcome('boom', true);
    expect(outcome).toEqual({
      isTimeout: false,
      setupStatus: ServerRunStatus.PARTIAL,
      serverStatus: ServerStatus.PARTIALLY_PREPARED,
      displayError: 'boom',
      displaySummary: "Setup partiel: certains rôles ont réussi avant l'échec.",
    });
  });

  it('redacts secrets in the display error for non-timeout failures', () => {
    const outcome = resolveSetupFailureOutcome(
      'failed with password=supersecret',
      false,
    );
    expect(outcome.displayError).not.toContain('supersecret');
  });
});
