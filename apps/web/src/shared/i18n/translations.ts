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
  Workspaces: "Espaces de travail",
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
  "→ the CI builds the image then triggers the Sovrack deployment.":
    "→ la CI build l'image puis déclenche le déploiement Sovrack.",
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

  // ── My Account ────────────────────────────────────────────────────────
  "My Account": "Mon compte",
  "Your personal settings — password, language, theme.":
    "Tes réglages personnels — mot de passe, langue, thème.",
  Profile: "Profil",
  "Connected user information.": "Informations de l'utilisateur connecté.",
  "Change password": "Changer le mot de passe",
  "Minimum 8 characters.": "Minimum 8 caractères.",
  "12 to 128 characters, with uppercase, lowercase and a digit.":
    "12 à 128 caractères, avec majuscule, minuscule et chiffre.",
  "Current password": "Mot de passe actuel",
  "New password": "Nouveau mot de passe",
  "Confirm new password": "Confirmer le nouveau mot de passe",
  "Update password": "Mettre à jour le mot de passe",
  "Password updated.": "Mot de passe mis à jour.",
  "Password confirmation does not match.": "La confirmation ne correspond pas.",
  "New password must contain at least 8 characters.":
    "Le nouveau mot de passe doit contenir au moins 8 caractères.",
  "Password must contain 12 to 128 characters, an uppercase letter, a lowercase letter and a digit.":
    "Le mot de passe doit contenir 12 à 128 caractères, une majuscule, une minuscule et un chiffre.",
  Preferences: "Préférences",
  "Language and appearance, saved on this browser.":
    "Langue et apparence, enregistrées sur ce navigateur.",
  "Light theme": "Thème clair",
  "Dark theme": "Thème sombre",
  "Danger zone": "Zone sensible",
  "Schedule deletion of your identity after a 30-day recovery period.":
    "Programmez la suppression de votre identité après un délai de récupération de 30 jours.",
  "A confirmation code will be sent by email. Confirmation immediately signs you out and disables access. Organizations are preserved; your personal workspace is deleted after 30 days. Transfer ownership first if you are the last owner of an organization.":
    "Un code de confirmation sera envoyé par email. La confirmation vous déconnecte immédiatement et désactive l’accès. Les organisations sont conservées ; votre espace personnel est supprimé après 30 jours. Transférez d’abord la propriété si vous êtes le dernier propriétaire d’une organisation.",
  "Schedule account deletion": "Programmer la suppression du compte",
  "Confirm and start 30-day grace period":
    "Confirmer et démarrer le délai de grâce de 30 jours",
  "A confirmation code has been sent to your email. Enter it below.":
    "Un code de confirmation a été envoyé à votre adresse email. Saisissez-le ci-dessous.",
  "Enter the 6-digit confirmation code.":
    "Saisissez le code de confirmation à 6 chiffres.",
  "Confirmation code": "Code de confirmation",
  "Unable to request deletion.":
    "Impossible de demander la suppression.",
  "Invalid or expired code.": "Code invalide ou expiré.",

  // ── Divers ────────────────────────────────────────────────────────────
  Deployment: "Déploiement",
  "(changing the repository = create another service)":
    "(changer de dépôt = créer un autre service)",

  // ── Pricing & Plans ────────────────────────────────────────────────────
  Pricing: "Tarifs",
  "Start for free.": "Commencez gratuitement.",
  "Simple, transparent pricing for teams of all sizes.":
    "Une tarification simple et transparente pour les développeurs et les équipes.",
  "Free (Hobby)": "Gratuit (Hobby)",
  Pro: "Pro",
  Team: "Team",
  Enterprise: "Entreprise",
  "Free forever": "Gratuit pour toujours",
  "1 server": "1 serveur",
  "1 project": "1 projet",
  "Unlimited servers": "Serveurs illimités",
  "Unlimited projects": "Projets illimités",
  "Unlimited team members": "Membres d'équipe illimités",
  "Automated backups": "Sauvegardes automatiques",
  "Priority support": "Support prioritaire",
  "Custom domain & SSL": "Domaine personnalisé & SSL",
  "Upgrade to Pro": "Passer au plan Pro",
  "Upgrade to Team": "Passer au plan Team",
  "Get Started": "Démarrer",
  "Current plan": "Plan actuel",
  "Billing": "Facturation",
  "Payment Method": "Moyen de paiement",
  "International (USD / EUR)": "International (USD / EUR)",
  "Tunisia (Dinars TND)": "Tunisie (Dinars TND)",
  "Pay with Card": "Payer par carte",
  "Switch language": "Changer de langue",

  // ── Authentication & OAuth ──────────────────────────────────────────────
  "Continue with Google": "Continuer avec Google",
  "Sign up with Google": "S'inscrire avec Google",
  "or with your email": "ou avec votre email",
  "Google authentication is not configured on this server.":
    "L'authentification Google n'est pas configurée sur ce serveur.",
  "Your account is disabled.": "Votre compte est désactivé.",
  "Google authentication failed. Please try again.":
    "Échec de l'authentification Google. Veuillez réessayer.",
  "Google authentication cancelled.": "Connexion Google annulée.",
};
