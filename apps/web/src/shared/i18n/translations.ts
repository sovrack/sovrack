/**
 * D1 (plan produit final) — dictionnaire de traduction, style gettext :
 * la CLÉ est le texte anglais source (celui écrit dans le code), la valeur
 * sa traduction française. Un texte absent du dictionnaire s'affiche en
 * anglais dans les deux langues — l'UI reste donc TOUJOURS cohérente, et la
 * couverture FR s'étend incrémentalement en ajoutant des entrées ici.
 */
export const FR: Record<string, string> = {
  // ── Navigation (sidebar / top-nav) ────────────────────────────────────
  Overview: "Vue d'ensemble",
  Delivery: "Livraison",
  Infrastructure: "Infrastructure",
  Settings: "Réglages",
  Dashboard: "Tableau de bord",
  Projects: "Projets",
  Deployments: "Déploiements",
  Automation: "Automatisation",
  Servers: "Serveurs",
  Registry: "Registre",
  "SSH Keys": "Clés SSH",
  Terminal: "Terminal",
  "Platform Settings": "Réglages plateforme",
  "Git Providers": "Fournisseurs Git",
  "Users & Teams": "Utilisateurs & équipes",
  "System Status": "État du système",
  "Audit Logs": "Journaux d'audit",
  "Recent activity": "Activité récente",
  "No recent activity": "Aucune activité récente",
  "View all deployments →": "Voir tous les déploiements →",
  Configure: "Configurer",
  "Log out": "Se déconnecter",
  New: "Nouveau",
  Notifications: "Notifications",
  "Toggle sidebar": "Basculer la barre latérale",

  // ── Onglets service ───────────────────────────────────────────────────
  General: "Général",
  Pipeline: "Pipeline",
  Standardisation: "Standardisation",
  Variables: "Variables",
  Domains: "Domaines",
  Webhooks: "Webhooks",
  Containers: "Conteneurs",
  Monitoring: "Monitoring",
  Logs: "Logs",

  // ── Actions service ───────────────────────────────────────────────────
  Deploy: "Déployer",
  Redeploy: "Redéployer",
  Stop: "Arrêter",
  "Open app": "Ouvrir l'app",
  Delete: "Supprimer",
  Project: "Projet",
  Cancel: "Annuler",
  Save: "Enregistrer",
  Refresh: "Rafraîchir",
  "Loading…": "Chargement…",

  // ── Pipelines (onglet) ────────────────────────────────────────────────
  "Pipelines (CI/CD)": "Pipelines (CI/CD)",
  "CI history of the repository": "Historique CI du dépôt",
  branch: "branche",
  "Loading pipelines…": "Chargement des pipelines…",
  "No pipelines": "Aucun pipeline",
  "CI pipelines will appear here as soon as the repository triggers one.":
    "Les pipelines CI apparaîtront ici dès que le dépôt en déclenche.",
  Open: "Ouvrir",

  // ── Monitoring (onglet) ───────────────────────────────────────────────
  "Container metrics": "Métriques du conteneur",
  "Real-time container stats (refreshed every 5s).":
    "Stats temps réel du conteneur (rafraîchies toutes les 5s).",
  Live: "Live",
  Paused: "En pause",
  "No deployment yet.": "Aucun déploiement pour l'instant.",
  "Server monitoring": "Monitoring du serveur",
  "Open Grafana": "Ouvrir Grafana",

  // ── CI generator (Standardisation) ────────────────────────────────────
  "Standardized CI/CD config": "Config CI/CD standardisée",
  Generate: "Générer",
  "1. Paste each file": "1. Colle chaque fichier",
  "at the indicated location (the path is above each block), at the root of your repository.":
    "à l'emplacement indiqué (le chemin est au-dessus de chaque bloc), à la racine de ton dépôt.",
  "2. Add 2 CI variables": "2. Ajoute 2 variables CI",
  "in your Git repository (GitLab: Settings → CI/CD → Variables; GitHub: Settings → Secrets and variables → Actions):":
    "dans ton dépôt Git (GitLab : Settings → CI/CD → Variables ; GitHub : Settings → Secrets and variables → Actions) :",
  "3. Push": "3. Push",
  "→ the CI builds the image then triggers the platform deployment.":
    "→ la CI build l'image puis déclenche le déploiement platform.",
  "(set up the webhook in the Webhooks tab)":
    "(configure le webhook dans l'onglet Webhooks)",
  "= the webhook secret (Webhooks tab)":
    "= le secret du webhook (onglet Webhooks)",

  // ── Page Infrastructure → Monitoring ─────────────────────────────────
  Integrations: "Intégrations",
  "Per-server health, live metrics and dashboards (Grafana / Prometheus / Loki).":
    "Santé par serveur, métriques temps réel et tableaux de bord (Grafana / Prometheus / Loki).",
  "Monitoring stack not installed": "Stack monitoring non installée",
  "Setup Monitoring": "Setup Monitoring",
  "Setup Monitoring started — the dashboards will appear here once the run completes (a few minutes).":
    "Setup Monitoring lancé — les tableaux de bord apparaîtront ici à la fin du run (quelques minutes).",
  "install it from Servers → Setup Server → Setup Monitoring.":
    "installe-la depuis Serveurs → Setup Server → Setup Monitoring.",
  "No servers": "Aucun serveur",
  "Add a server from Infrastructure → Servers to monitor it.":
    "Ajoute un serveur depuis Infrastructure → Serveurs pour le surveiller.",

  // ── Dashboard / Users ─────────────────────────────────────────────────
  Ready: "Prêt",
  Provisioning: "Provisionnement",
  Errors: "En erreur",
  Offline: "Hors ligne",
  "view all →": "voir tout →",
  Active: "Actif",
  Inactive: "Inactif",

  // ── Divers ────────────────────────────────────────────────────────────
  Deployment: "Déploiement",
  "(changing the repository = create another service)":
    "(changer de dépôt = créer un autre service)",
};
