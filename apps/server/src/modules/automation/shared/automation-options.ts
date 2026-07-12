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
    playbookPath: 'setup-server.yml',
    category: 'system',
    roles: ['system_base'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_docker',
    label: 'Installer Docker',
    description: 'Installe Docker Engine et Docker Compose plugin.',
    playbookPath: 'setup-server.yml',
    category: 'docker',
    roles: ['docker'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_gitlab_runner',
    label: 'Installer GitLab Runner',
    description: 'Installe et enregistre GitLab Runner (executor Docker).',
    playbookPath: 'setup-server.yml',
    category: 'ci',
    roles: ['gitlab_runner'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'configure_firewall',
    label: 'Configurer le firewall',
    description: 'Configure UFW (allow SSH/HTTP/HTTPS, deny le reste).',
    playbookPath: 'setup-server.yml',
    category: 'security',
    roles: ['firewall'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_fail2ban',
    label: 'Installer Fail2ban',
    description: 'Protects SSH against brute-force attacks.',
    playbookPath: 'setup-server.yml',
    category: 'security',
    roles: ['fail2ban'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'security_hardening',
    label: 'Security hardening',
    description: 'Applies system security best practices.',
    playbookPath: 'setup-server.yml',
    category: 'security',
    roles: ['security_hardening'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_monitoring_stack',
    label: 'Installer monitoring stack',
    description:
      'Installe la stack Prometheus + Grafana + Loki + Alertmanager + exporters via le control node.',
    playbookPath: 'setup-server.yml',
    category: 'monitoring',
    roles: [
      'docker',
      'node_exporter',
      'cadvisor',
      'prometheus',
      'grafana',
      'alertmanager',
      'loki',
    ],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'install_loki',
    label: 'Installer Loki (logs centralisés)',
    description:
      'Déploie Loki + Promtail pour le stockage et la recherche historique des logs runtime des conteneurs.',
    playbookPath: 'setup-server.yml',
    category: 'monitoring',
    roles: ['loki'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  {
    key: 'configure_swap',
    label: 'Configurer le swap',
    description: 'Creates and enables a 2 GB swap file.',
    playbookPath: 'setup-server.yml',
    category: 'system',
    roles: ['swap'],
    requiresSshValidated: true,
    requiresSudo: true,
  },
  // enable_ssl (certbot) retiré avec la voie SSL certbot (E4) — le HTTPS
  // passe par Traefik + Let's Encrypt (Setup Reverse Proxy, D5).
  // install_nginx/install_postgres/install_redis/install_nodejs retirés :
  // nginx n'est jamais câblé au routage HTTPS automatique (Traefik est le
  // seul), une base de données se déploie via un Service du catalogue
  // (moteur Docker générique), et Node.js hôte n'est requis par aucun
  // chemin du moteur de déploiement (tout tourne en conteneur).
];

export function getAutomationAction(key: string): AutomationAction | undefined {
  return AUTOMATION_ACTIONS.find((a) => a.key === key);
}
