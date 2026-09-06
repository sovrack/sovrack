import type { StartServerSetupDto } from '../dto/start-server-setup.dto';
import { ServerSetupProfile } from '../dto/start-server-setup.dto';
import { ROLE_ORDER, resolveSetupOptions } from './server-setup';

describe('resolveSetupOptions — secure explicit profiles', () => {
  const RUNTIME_ROLES = [
    'system_base',
    'swap',
    'security_hardening',
    'firewall',
    'fail2ban',
    'docker',
    'docker_tls',
    'traefik',
    'system_diagnostics',
    'node_exporter',
    'logrotate',
  ];

  it('defaults to the minimal production runtime', () => {
    const resolved = resolveSetupOptions();
    expect(resolved.profile).toBe(ServerSetupProfile.RUNTIME_MINIMAL);
    for (const role of RUNTIME_ROLES) {
      expect(resolved.roles).toContain(role);
    }
    expect(resolved.roles).not.toContain('gitlab_runner');
    expect(resolved.roles).not.toContain('grafana');
    expect(resolved.roles).not.toContain('loki');
  });

  it('adds only local exporters for the observability-agent profile', () => {
    const resolved = resolveSetupOptions({
      profile: ServerSetupProfile.OBSERVABILITY_AGENT,
    });
    expect(resolved.roles).toContain('cadvisor');
    expect(resolved.roles).not.toContain('grafana');
    expect(resolved.roles).not.toContain('gitlab_runner');
  });

  it('installs build tooling only in the build-runner profile', () => {
    const resolved = resolveSetupOptions({
      profile: ServerSetupProfile.BUILD_RUNNER,
    });
    expect(resolved.roles).toContain('nixpacks');
    expect(resolved.roles).toContain('gitlab_runner');
    expect(resolved.roles).not.toContain('grafana');
  });

  it('keeps the complete bundle explicitly available for development', () => {
    const resolved = resolveSetupOptions({
      profile: ServerSetupProfile.FULL_DEV,
    });
    expect(resolved.roles).toEqual(ROLE_ORDER);
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
    const resolved = resolveSetupOptions({
      profile: ServerSetupProfile.FULL_DEV,
    });
    const roleIndex = (r: string) => resolved.roles.indexOf(r as never);
    expect(roleIndex('docker_tls')).toBeGreaterThan(roleIndex('docker'));
    expect(resolved.roles).toEqual(ROLE_ORDER);
  });

  it('every profile is non-empty and follows ROLE_ORDER', () => {
    for (const profile of Object.values(ServerSetupProfile)) {
      const roles = resolveSetupOptions({ profile }).roles;
      expect(roles.length).toBeGreaterThan(0);
      expect(roles).toEqual(ROLE_ORDER.filter((role) => roles.includes(role)));
    }
  });
});
