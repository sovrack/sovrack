export type AutomationAction = {
  key: string;
  label: string;
  description: string;
  playbookPath: string;
  category:
    | 'system'
    | 'docker'
    | 'web'
    | 'database'
    | 'security'
    | 'monitoring'
    | 'ci';
  roles?: string[];
  requiresSshValidated: boolean;
  requiresSudo: boolean;
};

export const AUTOMATION_ACTIONS: AutomationAction[] = [
  {
    key: 'system_update',
    label: 'Mise à jour système',
    description: 'Met à jour tous les packages du système (apt upgrade).',
    playbookPath: 'prepare-server.yml',
    category: 'system',
    roles: ['common'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_docker',
    label: 'Installer Docker',
    description: 'Installe Docker Engine et Docker Compose plugin.',
    playbookPath: 'prepare-server.yml',
    category: 'docker',
    roles: ['docker'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_nginx',
    label: 'Installer Nginx',
    description: 'Installe et configure Nginx comme reverse proxy.',
    playbookPath: 'prepare-server.yml',
    category: 'web',
    roles: ['nginx'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_postgres',
    label: 'Installer PostgreSQL',
    description: 'Installe PostgreSQL 16 et configure les accès.',
    playbookPath: 'prepare-server.yml',
    category: 'database',
    roles: ['postgres'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_redis',
    label: 'Installer Redis',
    description: 'Installe Redis pour le cache et les queues.',
    playbookPath: 'prepare-server.yml',
    category: 'database',
    roles: ['redis'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_gitlab_runner',
    label: 'Installer GitLab Runner',
    description: 'Installe et enregistre GitLab Runner (executor Docker).',
    playbookPath: 'prepare-server.yml',
    category: 'ci',
    roles: ['gitlab_runner'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'configure_firewall',
    label: 'Configurer le firewall',
    description: 'Configure UFW (allow SSH/HTTP/HTTPS, deny le reste).',
    playbookPath: 'prepare-server.yml',
    category: 'security',
    roles: ['firewall'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_fail2ban',
    label: 'Installer Fail2ban',
    description: 'Protège SSH contre les attaques brute-force.',
    playbookPath: 'prepare-server.yml',
    category: 'security',
    roles: ['fail2ban'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'security_hardening',
    label: 'Durcissement sécurité',
    description: 'Applique les bonnes pratiques de sécurité système.',
    playbookPath: 'prepare-server.yml',
    category: 'security',
    roles: ['security_hardening'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_monitoring',
    label: 'Installer monitoring',
    description: 'Installe les agents de monitoring (Node Exporter, etc.).',
    playbookPath: 'prepare-server.yml',
    category: 'monitoring',
    roles: ['monitoring'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'configure_swap',
    label: 'Configurer le swap',
    description: 'Crée et active un fichier swap de 2 Go.',
    playbookPath: 'prepare-server.yml',
    category: 'system',
    roles: ['swap'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
];

export function getAutomationAction(key: string): AutomationAction | undefined {
  return AUTOMATION_ACTIONS.find((a) => a.key === key);
}
