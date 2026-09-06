import {
  ServerSetupProfile,
  type StartServerSetupDto,
} from '../dto/start-server-setup.dto';

// Rôles réellement pilotables — toujours dans cet ordre d'exécution. Exporté
// pour que les consommateurs (suivi de rôle + filtre de retry de l'orchestrateur)
// ne codent jamais en dur une liste partielle qui perdrait silencieusement un
// rôle comme `nixpacks`.
export type SetupRoleKey =
  | 'system_base'
  | 'docker'
  | 'docker_tls'
  | 'traefik'
  | 'nixpacks'
  | 'gitlab_runner'
  | 'firewall'
  | 'fail2ban'
  | 'system_diagnostics'
  | 'node_exporter'
  | 'cadvisor'
  | 'prometheus'
  | 'grafana'
  | 'alertmanager'
  | 'loki'
  | 'logrotate'
  | 'swap'
  | 'security_hardening';

export const ROLE_ORDER: SetupRoleKey[] = [
  'system_base',
  'swap',
  'security_hardening',
  'firewall',
  'fail2ban',
  'docker',
  'docker_tls',
  'traefik',
  'nixpacks',
  'gitlab_runner',
  'system_diagnostics',
  'node_exporter',
  'cadvisor',
  'prometheus',
  'grafana',
  'alertmanager',
  'loki',
  'logrotate',
];

const RUNTIME_MINIMAL_ROLES: SetupRoleKey[] = [
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

const SETUP_PROFILE_ROLES: Record<ServerSetupProfile, SetupRoleKey[]> = {
  [ServerSetupProfile.RUNTIME_MINIMAL]: RUNTIME_MINIMAL_ROLES,
  [ServerSetupProfile.OBSERVABILITY_AGENT]: [
    ...RUNTIME_MINIMAL_ROLES,
    'cadvisor',
  ],
  [ServerSetupProfile.BUILD_RUNNER]: [
    ...RUNTIME_MINIMAL_ROLES,
    'nixpacks',
    'gitlab_runner',
  ],
  [ServerSetupProfile.FULL_DEV]: [
    ...RUNTIME_MINIMAL_ROLES,
    'nixpacks',
    'gitlab_runner',
    'cadvisor',
    'prometheus',
    'grafana',
    'alertmanager',
    'loki',
  ],
};

export type ResolvedSetup = {
  profile: ServerSetupProfile;
  roles: SetupRoleKey[];
  gitlabRunnerExecutor: string;
};

/**
 * Resolve the explicit profile server-side. The safe default excludes build
 * runners and operator dashboards from production application hosts.
 */
export function resolveSetupOptions(dto?: StartServerSetupDto): ResolvedSetup {
  const profile = dto?.profile ?? ServerSetupProfile.RUNTIME_MINIMAL;
  const gitlabRunnerExecutor = dto?.gitlabRunnerExecutor?.trim() || 'docker';
  const selected = new Set(SETUP_PROFILE_ROLES[profile]);
  const roles = ROLE_ORDER.filter((role) => selected.has(role));

  return {
    profile,
    roles,
    gitlabRunnerExecutor,
  };
}
