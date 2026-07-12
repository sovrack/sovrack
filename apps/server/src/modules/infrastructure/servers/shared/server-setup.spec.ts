import type { StartServerSetupDto } from '../dto/start-server-setup.dto';
import { ROLE_ORDER, resolveSetupOptions } from './server-setup';

// Décision produit : "Setup Server" installe TOUJOURS le jeu complet — aucun
// profil, aucune option, aucune case à cocher. GitLab Runner et la stack
// d'observabilité (Prometheus/Grafana/Loki/Alertmanager/exporters) sont
// systématiques, au même titre que Docker ou le firewall. Seul le mode
// d'exécuteur GitLab Runner (docker/shell) reste paramétrable.
describe('resolveSetupOptions — always the full bundle, no choices', () => {
  const EXPECTED_ROLES = [
    'system_base',
    'docker',
    'docker_tls',
    'traefik',
    'nixpacks',
    'gitlab_runner',
    'firewall',
    'fail2ban',
    'swap',
    'system_diagnostics',
    'node_exporter',
    'cadvisor',
    'prometheus',
    'grafana',
    'alertmanager',
    'loki',
    'logrotate',
    'security_hardening',
  ];

  it('always includes the full bundle, with no dto at all', () => {
    const resolved = resolveSetupOptions();
    for (const role of EXPECTED_ROLES) {
      expect(resolved.roles).toContain(role);
    }
    expect(resolved.roles).toHaveLength(EXPECTED_ROLES.length);
  });

  it('the dto has no on/off switch for anything — only gitlabRunnerExecutor', () => {
    // Passing any dto at all changes nothing about which roles run.
    const resolved = resolveSetupOptions({} as StartServerSetupDto);
    for (const role of EXPECTED_ROLES) {
      expect(resolved.roles).toContain(role);
    }
  });

  it('defaults gitlabRunnerExecutor to docker', () => {
    expect(resolveSetupOptions().gitlabRunnerExecutor).toBe('docker');
    expect(
      resolveSetupOptions({
        gitlabRunnerExecutor: 'shell',
      } as StartServerSetupDto).gitlabRunnerExecutor,
    ).toBe('shell');
  });

  it('runs docker_tls after docker, and roles follow ROLE_ORDER', () => {
    const resolved = resolveSetupOptions();
    const roleIndex = (r: string) => resolved.roles.indexOf(r as never);
    expect(roleIndex('docker_tls')).toBeGreaterThan(roleIndex('docker'));
    expect(resolved.roles).toEqual(ROLE_ORDER);
  });

  it('is never empty', () => {
    expect(resolveSetupOptions().roles.length).toBeGreaterThan(0);
  });
});
