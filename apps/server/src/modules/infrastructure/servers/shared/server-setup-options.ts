import { ServerPreparationProfile } from '@prisma/client';
import type { StartServerSetupDto } from '../dto/start-server-setup.dto';

export type SetupOptionKey =
  | 'systemUpdate'
  | 'docker'
  | 'dockerComposePlugin'
  | 'dockerTls'
  | 'reverseProxy'
  | 'nginx'
  | 'nixpacks'
  | 'nodejs'
  | 'postgres'
  | 'redis'
  | 'gitlabRunner'
  | 'firewall'
  | 'fail2ban'
  | 'swap'
  | 'monitoring'
  | 'backup'
  | 'logrotate'
  | 'securityHardening'
  | 'autoUpdates';

export type SetupRoleKey =
  | 'system_base'
  | 'docker'
  | 'docker_tls'
  | 'traefik'
  | 'nginx'
  | 'nixpacks'
  | 'nodejs'
  | 'postgres'
  | 'redis'
  | 'gitlab_runner'
  | 'firewall'
  | 'fail2ban'
  | 'monitoring'
  | 'node_exporter'
  | 'cadvisor'
  | 'prometheus'
  | 'grafana'
  | 'alertmanager'
  | 'backup'
  | 'logrotate'
  | 'swap'
  | 'security_hardening';

export type ResolvedSetup = {
  profile: ServerPreparationProfile;
  selectedOptions: Record<SetupOptionKey, boolean>;
  roles: SetupRoleKey[];
  warnings: string[];
  gitlabRunnerExecutor: string;
  reinstallOptions: Set<string>;
};

export type SetupOptionDefinition = {
  key: SetupOptionKey;
  label: string;
  description: string;
  role: SetupRoleKey | null;
  dependencies: SetupOptionKey[];
  recommended: boolean;
};

// Single source of truth for the full set of setup roles. Exported so
// consumers (e.g. the setup orchestrator's role-tracking + retry filter)
// never hardcode a partial list that silently drops a role like `nixpacks`.
export const ROLE_ORDER: SetupRoleKey[] = [
  'system_base',
  'swap',
  'security_hardening',
  'firewall',
  'fail2ban',
  'docker',
  'docker_tls',
  'traefik',
  'nginx',
  'nixpacks',
  'nodejs',
  'postgres',
  'redis',
  'gitlab_runner',
  'monitoring',
  'node_exporter',
  'cadvisor',
  'prometheus',
  'grafana',
  'alertmanager',
  'backup',
  'logrotate',
];

export const SETUP_OPTIONS: SetupOptionDefinition[] = [
  {
    key: 'systemUpdate',
    label: 'System base (apt cache + essential packages)',
    description:
      'Refresh the apt cache and install essential base packages (ca-certificates, curl, gnupg, git…).',
    role: 'system_base',
    dependencies: [],
    recommended: true,
  },
  {
    key: 'docker',
    label: 'Docker Engine',
    description: 'Install and enable Docker Engine on the VPS.',
    role: 'docker',
    dependencies: ['systemUpdate'],
    recommended: true,
  },
  {
    key: 'dockerComposePlugin',
    label: 'Docker Compose plugin',
    description:
      'Install the Docker Compose v2 plugin as part of Docker setup.',
    role: 'docker',
    dependencies: ['docker'],
    recommended: true,
  },
  {
    key: 'dockerTls',
    label: 'Docker TLS Connection (recommended)',
    description:
      'Enables the platform to deploy on this server automatically — required for deployments. Configures the Docker daemon for mTLS on port 2376 and registers the connection automatically.',
    role: 'docker_tls',
    dependencies: ['docker'],
    recommended: true,
  },
  {
    key: 'reverseProxy',
    label: 'Reverse Proxy (Traefik + HTTPS)',
    description:
      'Install Traefik on ports 80/443 with automatic Let’s Encrypt certificates. Once installed, any service with a configured domain gets HTTPS automatically at deploy time. Replaces Nginx (do not install both).',
    role: 'traefik',
    dependencies: ['docker'],
    recommended: false,
  },
  {
    key: 'nginx',
    label: 'Nginx',
    description: 'Install and enable Nginx as reverse proxy.',
    role: 'nginx',
    dependencies: ['systemUpdate'],
    recommended: false,
  },
  {
    key: 'nixpacks',
    label: 'Nixpacks (image builder)',
    description:
      'Install the Nixpacks builder for zero-config container images. Self-sufficient: refreshes its own apt cache and installs curl/gzip — no separate base step required.',
    role: 'nixpacks',
    dependencies: [],
    recommended: false,
  },
  {
    key: 'nodejs',
    label: 'Node.js',
    description: 'Install Node.js runtime and npm.',
    role: 'nodejs',
    dependencies: ['systemUpdate'],
    recommended: false,
  },
  {
    key: 'postgres',
    label: 'PostgreSQL',
    description: 'Install and enable PostgreSQL.',
    role: 'postgres',
    dependencies: ['systemUpdate'],
    recommended: false,
  },
  {
    key: 'redis',
    label: 'Redis',
    description: 'Install and enable Redis.',
    role: 'redis',
    dependencies: ['systemUpdate'],
    recommended: false,
  },
  {
    key: 'gitlabRunner',
    label: 'GitLab Runner',
    description:
      'Install GitLab Runner. Docker executor automatically requires Docker.',
    role: 'gitlab_runner',
    dependencies: ['systemUpdate'],
    recommended: false,
  },
  {
    key: 'firewall',
    label: 'UFW firewall',
    description: 'Install and configure UFW with safe default ports.',
    role: 'firewall',
    dependencies: ['systemUpdate'],
    recommended: true,
  },
  {
    key: 'fail2ban',
    label: 'Fail2ban',
    description: 'Protect SSH with Fail2ban jail configuration.',
    role: 'fail2ban',
    dependencies: ['firewall'],
    recommended: true,
  },
  {
    key: 'swap',
    label: 'Swap setup',
    description: 'Create swap file only if missing and requested.',
    role: 'swap',
    dependencies: [],
    recommended: true,
  },
  {
    key: 'monitoring',
    label: 'Monitoring agent',
    description: 'Prepare lightweight node monitoring tooling.',
    role: 'monitoring',
    dependencies: ['systemUpdate'],
    recommended: false,
  },
  {
    key: 'backup',
    label: 'Backup tools',
    description: 'Install backup tooling and directories.',
    role: 'backup',
    dependencies: ['systemUpdate'],
    recommended: false,
  },
  {
    key: 'logrotate',
    label: 'Log rotation',
    description: 'Install and configure sane logrotate defaults.',
    role: 'logrotate',
    dependencies: ['systemUpdate'],
    recommended: true,
  },
  {
    key: 'securityHardening',
    label: 'Security hardening',
    description: 'Apply conservative SSH/sysctl/unattended-upgrades hardening.',
    role: 'security_hardening',
    dependencies: ['systemUpdate'],
    recommended: true,
  },
  {
    key: 'autoUpdates',
    label: 'Automatic security updates',
    description:
      'Enable unattended security upgrades through security hardening.',
    role: 'security_hardening',
    dependencies: ['securityHardening'],
    recommended: true,
  },
];

export const SETUP_PROFILE_DEFAULTS: Record<
  ServerPreparationProfile,
  Partial<Record<SetupOptionKey, boolean>>
> = {
  BASIC: {
    systemUpdate: true,
    docker: true,
    dockerComposePlugin: true,
    dockerTls: true,
    firewall: true,
    fail2ban: true,
    swap: true,
    logrotate: true,
    securityHardening: true,
    autoUpdates: true,
  },
  WEB: {
    systemUpdate: true,
    docker: true,
    dockerComposePlugin: true,
    dockerTls: true,
    nginx: true,
    firewall: true,
    fail2ban: true,
    swap: true,
    logrotate: true,
    securityHardening: true,
    autoUpdates: true,
  },
  DATABASE: {
    systemUpdate: true,
    postgres: true,
    redis: true,
    firewall: true,
    fail2ban: true,
    backup: true,
    logrotate: true,
    securityHardening: true,
    autoUpdates: true,
  },
  RUNNER: {
    systemUpdate: true,
    docker: true,
    dockerComposePlugin: true,
    dockerTls: true,
    gitlabRunner: true,
    firewall: true,
    fail2ban: true,
    logrotate: true,
    securityHardening: true,
  },
  FULL: {
    systemUpdate: true,
    docker: true,
    dockerComposePlugin: true,
    dockerTls: true,
    nginx: true,
    nixpacks: true,
    nodejs: true,
    postgres: true,
    redis: true,
    gitlabRunner: true,
    firewall: true,
    fail2ban: true,
    swap: true,
    monitoring: true,
    backup: true,
    logrotate: true,
    securityHardening: true,
    autoUpdates: true,
  },
  CUSTOM: {},
};

export function resolveSetupOptions(
  dto?: StartServerSetupDto,
): ResolvedSetup {
  const profile = dto?.profile ?? ServerPreparationProfile.BASIC;
  const selected = Object.fromEntries(
    SETUP_OPTIONS.map((option) => [option.key, false]),
  ) as Record<SetupOptionKey, boolean>;

  Object.assign(selected, SETUP_PROFILE_DEFAULTS[profile]);

  for (const option of SETUP_OPTIONS) {
    const explicit = dto?.[option.key];
    if (explicit !== undefined) {
      selected[option.key] = explicit;
    }
  }

  if (dto?.postgresql !== undefined) {
    selected.postgres = dto.postgresql;
  }

  const gitlabRunnerExecutor = dto?.gitlabRunnerExecutor?.trim() || 'docker';
  if (selected.gitlabRunner && gitlabRunnerExecutor === 'docker') {
    selected.docker = true;
    selected.dockerComposePlugin = true;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const option of SETUP_OPTIONS) {
      if (!selected[option.key]) {
        continue;
      }
      for (const dependency of option.dependencies) {
        if (!selected[dependency]) {
          selected[dependency] = true;
          changed = true;
        }
      }
    }
  }

  const roleSet = new Set<SetupRoleKey>();
  for (const option of SETUP_OPTIONS) {
    if (selected[option.key] && option.role) {
      roleSet.add(option.role);
    }
  }

  const roles = ROLE_ORDER.filter((role) => roleSet.has(role));

  const reinstallOptions = new Set<string>(dto?.reinstallOptions ?? []);

  const warnings: string[] = [];
  if (selected.nixpacks && !selected.docker) {
    warnings.push(
      'Nixpacks construit des images Docker — assurez-vous que Docker est déjà installé sur le VPS, ou sélectionnez aussi "Docker Engine".',
    );
  }

  return {
    profile,
    selectedOptions: selected,
    roles,
    warnings,
    gitlabRunnerExecutor,
    reinstallOptions,
  };
}
