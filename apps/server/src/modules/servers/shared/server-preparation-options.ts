import { ServerPreparationProfile } from '@prisma/client';
import type { StartServerPreparationDto } from '../dto/start-server-preparation.dto';

export type PreparationOptionKey =
  | 'systemUpdate'
  | 'docker'
  | 'dockerComposePlugin'
  | 'nginx'
  | 'nodejs'
  | 'postgres'
  | 'redis'
  | 'gitlabRunner'
  | 'firewall'
  | 'fail2ban'
  | 'certbot'
  | 'swap'
  | 'monitoring'
  | 'backup'
  | 'logrotate'
  | 'securityHardening'
  | 'autoUpdates';

export type PreparationRoleKey =
  | 'common'
  | 'docker'
  | 'nginx'
  | 'nodejs'
  | 'postgres'
  | 'redis'
  | 'gitlab_runner'
  | 'firewall'
  | 'fail2ban'
  | 'ssl'
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

export type ResolvedPreparation = {
  profile: ServerPreparationProfile;
  selectedOptions: Record<PreparationOptionKey, boolean>;
  roles: PreparationRoleKey[];
  warnings: string[];
  gitlabRunnerExecutor: string;
};

export type PreparationOptionDefinition = {
  key: PreparationOptionKey;
  label: string;
  description: string;
  role: PreparationRoleKey | null;
  dependencies: PreparationOptionKey[];
  recommended: boolean;
};

const ROLE_ORDER: PreparationRoleKey[] = [
  'common',
  'swap',
  'security_hardening',
  'firewall',
  'fail2ban',
  'docker',
  'nginx',
  'ssl',
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

export const PREPARATION_OPTIONS: PreparationOptionDefinition[] = [
  {
    key: 'systemUpdate',
    label: 'System update',
    description: 'Refresh package cache and install common base packages.',
    role: 'common',
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
    key: 'nginx',
    label: 'Nginx',
    description: 'Install and enable Nginx as reverse proxy.',
    role: 'nginx',
    dependencies: ['systemUpdate'],
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
    key: 'certbot',
    label: 'Certbot SSL',
    description: 'Install Certbot integration. Requires Nginx.',
    role: 'ssl',
    dependencies: ['nginx'],
    recommended: false,
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

export const PREPARATION_PROFILE_DEFAULTS: Record<
  ServerPreparationProfile,
  Partial<Record<PreparationOptionKey, boolean>>
> = {
  BASIC: {
    systemUpdate: true,
    docker: true,
    dockerComposePlugin: true,
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
    nginx: true,
    certbot: true,
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
    nginx: true,
    nodejs: true,
    postgres: true,
    redis: true,
    gitlabRunner: true,
    firewall: true,
    fail2ban: true,
    certbot: true,
    swap: true,
    monitoring: true,
    backup: true,
    logrotate: true,
    securityHardening: true,
    autoUpdates: true,
  },
  CUSTOM: {},
};

export function resolvePreparationOptions(
  dto?: StartServerPreparationDto,
): ResolvedPreparation {
  const profile = dto?.profile ?? ServerPreparationProfile.BASIC;
  const selected = Object.fromEntries(
    PREPARATION_OPTIONS.map((option) => [option.key, false]),
  ) as Record<PreparationOptionKey, boolean>;

  Object.assign(selected, PREPARATION_PROFILE_DEFAULTS[profile]);

  for (const option of PREPARATION_OPTIONS) {
    const explicit = dto?.[option.key];
    if (explicit !== undefined) {
      selected[option.key] = explicit;
    }
  }

  if (dto?.postgresql !== undefined) {
    selected.postgres = dto.postgresql;
  }
  if (dto?.ssl !== undefined) {
    selected.certbot = dto.ssl;
  }

  const gitlabRunnerExecutor = dto?.gitlabRunnerExecutor?.trim() || 'docker';
  if (selected.gitlabRunner && gitlabRunnerExecutor === 'docker') {
    selected.docker = true;
    selected.dockerComposePlugin = true;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const option of PREPARATION_OPTIONS) {
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

  const roleSet = new Set<PreparationRoleKey>();
  for (const option of PREPARATION_OPTIONS) {
    if (selected[option.key] && option.role) {
      roleSet.add(option.role);
    }
  }

  const roles = ROLE_ORDER.filter((role) => roleSet.has(role));

  return {
    profile,
    selectedOptions: selected,
    roles,
    warnings: [],
    gitlabRunnerExecutor,
  };
}
