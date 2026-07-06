import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTOMATION_ACTIONS, getAutomationAction } from './automation-options';
import { SETUP_OPTIONS } from '../../infrastructure/servers/shared/server-setup-options';

/**
 * E9 (plan produit final) — intégrité du catalogue d'actions Automation.
 *
 * Ce module avait 0 test sur son catalogue alors que c'est LA source des
 * runs Ansible. Historique réel de cette classe de bug : 5 rôles monitoring
 * absents de allowed_setup_roles (2026-06), et l'action enable_ssl restée
 * pointée sur le rôle `ssl` supprimé (E4, attrapé en écrivant ce spec).
 * Ces tests empêchent définitivement la dérive catalogue ↔ whitelist ansible.
 */
function readAllowedSetupRoles(): string[] {
  const playbook = readFileSync(
    join(__dirname, '../../../../ansible/playbooks/setup-server.yml'),
    'utf-8',
  );
  const block = playbook.split('allowed_setup_roles:')[1];
  expect(block).toBeDefined();
  const roles: string[] = [];
  for (const line of block.split('\n').slice(1)) {
    const m = line.match(/^\s+-\s+([a-z0-9_]+)\s*$/);
    if (!m) break;
    roles.push(m[1]);
  }
  expect(roles.length).toBeGreaterThan(0);
  return roles;
}

describe('AUTOMATION_ACTIONS catalog integrity', () => {
  it('has unique action keys', () => {
    const keys = AUTOMATION_ACTIONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every setup-server action only references ansible-whitelisted roles', () => {
    const allowed = new Set(readAllowedSetupRoles());
    for (const action of AUTOMATION_ACTIONS) {
      if (action.playbookPath !== 'setup-server.yml') continue;
      for (const role of action.roles ?? []) {
        expect({
          action: action.key,
          role,
          allowed: allowed.has(role),
        }).toEqual({ action: action.key, role, allowed: true });
      }
    }
  });

  it('preparation options reference only whitelisted ansible roles too', () => {
    const allowed = new Set(readAllowedSetupRoles());
    for (const option of SETUP_OPTIONS) {
      expect({ option: option.key, allowed: allowed.has(option.role) }).toEqual(
        { option: option.key, allowed: true },
      );
    }
  });

  it('getAutomationAction finds existing keys and returns undefined otherwise', () => {
    expect(getAutomationAction('install_docker')?.roles).toContain('docker');
    expect(getAutomationAction('ghost_action')).toBeUndefined();
    // enable_ssl (certbot) supprimé avec E4 — ne doit jamais réapparaître.
    expect(getAutomationAction('enable_ssl')).toBeUndefined();
  });
});
