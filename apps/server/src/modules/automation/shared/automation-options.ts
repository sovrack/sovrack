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
    label: 'System update',
    description: 'Updates all system packages (apt upgrade).',
    playbookPath: 'prepare-server.yml',
    category: 'system',
    roles: ['system_base'],
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
    description: 'Installs PostgreSQL 16 and configures access.',
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
    description: 'Protects SSH against brute-force attacks.',
    playbookPath: 'prepare-server.yml',
    category: 'security',
    roles: ['fail2ban'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'security_hardening',
    label: 'Security hardening',
    description: 'Applies system security best practices.',
    playbookPath: 'prepare-server.yml',
    category: 'security',
    roles: ['security_hardening'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_monitoring',
    label: 'Installer monitoring agent',
    description:
      'Installs the lightweight monitoring agent on each target VPS (node_exporter/sysstat).',
    playbookPath: 'prepare-server.yml',
    category: 'monitoring',
    roles: ['monitoring'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_monitoring_stack',
    label: 'Installer monitoring stack',
    description:
      'Installe la stack Prometheus + Grafana + Alertmanager + exporters via le control node.',
    playbookPath: 'prepare-server.yml',
    category: 'monitoring',
    roles: [
      'docker',
      'node_exporter',
      'cadvisor',
      'prometheus',
      'grafana',
      'alertmanager',
    ],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_loki',
    label: 'Installer Loki (logs centralisés)',
    description:
      'Déploie Loki + Promtail pour le stockage et la recherche historique des logs runtime des conteneurs.',
    playbookPath: 'prepare-server.yml',
    category: 'monitoring',
    roles: ['loki'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_prometheus_grafana',
    label: 'Installer Prometheus + Grafana',
    description:
      'Installs Prometheus, Grafana and Node Exporter for basic observability.',
    playbookPath: 'prepare-server.yml',
    category: 'monitoring',
    roles: ['docker', 'node_exporter', 'prometheus', 'grafana'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'configure_swap',
    label: 'Configurer le swap',
    description: 'Creates and enables a 2 GB swap file.',
    playbookPath: 'prepare-server.yml',
    category: 'system',
    roles: ['swap'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'enable_ssl',
    label: "Activer SSL / HTTPS (Let's Encrypt)",
    description:
      "Installs Certbot and obtains a Let's Encrypt certificate for the configured domains. Automatic renewal enabled.",
    playbookPath: 'prepare-server.yml',
    category: 'web',
    roles: ['ssl'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_nodejs',
    label: 'Installer Node.js',
    description: 'Installe Node.js LTS via NodeSource.',
    playbookPath: 'prepare-server.yml',
    category: 'system',
    roles: ['nodejs'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
];

export function getAutomationAction(key: string): AutomationAction | undefined {
  return AUTOMATION_ACTIONS.find((a) => a.key === key);
}
