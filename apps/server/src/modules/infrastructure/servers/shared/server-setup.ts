import type { StartServerSetupDto } from '../dto/start-server-setup.dto';

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

// Décision produit : "Setup Server" installe TOUT ce qui est nécessaire à un
// bon déploiement, EN UN SEUL BOUTON, sans aucun choix — ni case à cocher, ni
// profil, ni catalogue d'options. Tout est conteneurisé, le coût RAM/disque
// est négligeable, donc pas de raison de faire un tri : GitLab Runner et la
// stack d'observabilité complète (Prometheus/Grafana/Loki/Alertmanager/
// exporters) sont désormais installés systématiquement, au même titre que
// Docker ou le firewall. `nginx`/`postgres`/`redis`/`nodejs`/`backup` restent
// exclus : nginx n'est jamais câblé au routage HTTPS automatique (Traefik est
// le seul), une base de données se déploie via un Service du catalogue
// (moteur Docker générique, jamais un rôle Ansible séparé et invisible du
// catalogue), et backup n'a jamais eu de vraie politique de sauvegarde
// branchée dessus.
const CORE_ROLES: SetupRoleKey[] = [
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

export type ResolvedSetup = {
  // Conservé uniquement pour l'affichage historique dans ServerRun.profile
  // (String simple, non lié à un enum) — il n'y a plus de vrai "profil".
  profile: 'AUTO';
  roles: SetupRoleKey[];
  gitlabRunnerExecutor: string;
};

/**
 * Un seul jeu de rôles fixe, TOUJOURS complet — plus aucune option. Seul
 * `gitlabRunnerExecutor` reste configurable (docker/shell), pour paramétrer
 * COMMENT GitLab Runner s'installe, pas SI il s'installe.
 */
export function resolveSetupOptions(dto?: StartServerSetupDto): ResolvedSetup {
  const gitlabRunnerExecutor = dto?.gitlabRunnerExecutor?.trim() || 'docker';
  const roles = ROLE_ORDER.filter((role) => CORE_ROLES.includes(role));

  return {
    profile: 'AUTO',
    roles,
    gitlabRunnerExecutor,
  };
}
