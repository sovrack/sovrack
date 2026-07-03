import { ServerRunStatus, ServerStatus } from '@prisma/client';
import { PreparationRoleKey } from '../../servers/shared/server-preparation-options';
import {
  computeBlockingReasons,
  computePreparationTimeoutMs,
  parseRoleFromAnsibleLogLine,
  resolvePreparationFailureOutcome,
  roleDisplayName,
  type PreparationReadinessChecks,
} from './infra-preparation.util';

function checks(
  overrides: Partial<PreparationReadinessChecks> = {},
): PreparationReadinessChecks {
  return {
    serverActive: true,
    serverNotDisabled: true,
    sshValidated: true,
    sshReachable: true,
    authSucceeded: true,
    sudoAvailable: true,
    noActivePreparation: true,
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
      'La validation SSH doit réussir avant la préparation.',
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
      'sudo sans mot de passe doit être validé pour préparer ce serveur.',
    ]);
  });

  it('flags an already-running preparation', () => {
    expect(
      computeBlockingReasons(checks({ noActivePreparation: false })),
    ).toEqual(['Une préparation serveur est déjà en cours pour ce VPS.']);
  });

  it('accumulates every applicable reason', () => {
    expect(
      computeBlockingReasons(
        checks({
          serverActive: false,
          sshValidated: false,
          sudoAvailable: false,
          noActivePreparation: false,
        }),
      ),
    ).toHaveLength(4);
  });
});

describe('parseRoleFromAnsibleLogLine', () => {
  const knownRoles = new Set<PreparationRoleKey>(['system_base', 'docker']);

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
    expect(roleDisplayName('made_up_role' as PreparationRoleKey)).toBe(
      'made up role',
    );
  });
});

describe('computePreparationTimeoutMs', () => {
  it('uses the env override when it is at least 1 minute', () => {
    expect(computePreparationTimeoutMs(['docker'], 90_000)).toBe(90_000);
  });

  it('ignores an env override below 1 minute', () => {
    expect(computePreparationTimeoutMs([], 1_000)).toBe(10 * 60_000);
  });

  it('derives the budget dynamically from selected roles', () => {
    // base 5min + system_base 3min + docker 20min = 28min
    expect(computePreparationTimeoutMs(['system_base', 'docker'], 0)).toBe(
      28 * 60_000,
    );
  });

  it('applies the default per-role budget for unlisted roles', () => {
    expect(computePreparationTimeoutMs(['some_unknown_role'], 0)).toBe(
      10 * 60_000,
    );
  });

  it('clamps to the minimum timeout for a tiny role set', () => {
    expect(computePreparationTimeoutMs([], 0)).toBe(10 * 60_000);
  });

  it('clamps to the maximum timeout for an oversized role set', () => {
    const manyRoles = Array.from({ length: 30 }, () => 'docker');
    expect(computePreparationTimeoutMs(manyRoles, 0)).toBe(120 * 60_000);
  });
});

describe('resolvePreparationFailureOutcome', () => {
  it('handles a timeout with no successful task', () => {
    const outcome = resolvePreparationFailureOutcome(
      'JOB_TIMEOUT_2024\nAnsible did not respond',
      false,
    );
    expect(outcome).toEqual({
      isTimeout: true,
      prepStatus: ServerRunStatus.TIMEOUT,
      serverStatus: ServerStatus.PREPARATION_FAILED,
      displayError: 'Ansible did not respond',
      displaySummary:
        "Timeout: aucun rôle n'a pu terminer dans le délai imparti.",
    });
  });

  it('handles a timeout with at least one successful task', () => {
    const outcome = resolvePreparationFailureOutcome('JOB_TIMEOUT_2024', true);
    expect(outcome).toEqual({
      isTimeout: true,
      prepStatus: ServerRunStatus.TIMEOUT,
      serverStatus: ServerStatus.PARTIALLY_PREPARED,
      displayError: 'Ansible a dépassé le délai configuré.',
      displaySummary:
        'Timeout: certains rôles ont réussi avant que le délai soit atteint.',
    });
  });

  it('handles a non-timeout failure with no successful task', () => {
    const outcome = resolvePreparationFailureOutcome('boom', false);
    expect(outcome).toEqual({
      isTimeout: false,
      prepStatus: ServerRunStatus.FAILED,
      serverStatus: ServerStatus.PREPARATION_FAILED,
      displayError: 'boom',
      displaySummary: 'Préparation échouée.',
    });
  });

  it('handles a non-timeout failure with at least one successful task', () => {
    const outcome = resolvePreparationFailureOutcome('boom', true);
    expect(outcome).toEqual({
      isTimeout: false,
      prepStatus: ServerRunStatus.PARTIAL,
      serverStatus: ServerStatus.PARTIALLY_PREPARED,
      displayError: 'boom',
      displaySummary:
        "Préparation partielle: certains rôles ont réussi avant l'échec.",
    });
  });

  it('redacts secrets in the display error for non-timeout failures', () => {
    const outcome = resolvePreparationFailureOutcome(
      'failed with password=supersecret',
      false,
    );
    expect(outcome.displayError).not.toContain('supersecret');
  });
});
