/**
 * Source de vérité produit pour les surfaces exposées par le frontend.
 *
 * Ce fichier ne remplace jamais les contrôles d'autorisation du backend. Il
 * empêche uniquement l'interface et le site public de présenter comme prête
 * une capacité qui ne l'est pas encore.
 */
export const PRODUCT_STAGE = "private-development" as const;

export type ProductCapabilityStatus = "available" | "beta" | "planned";

type ProductCapabilityDefinition = {
  label: string;
  status: ProductCapabilityStatus;
  decision: string;
};

export const PRODUCT_CAPABILITIES = {
  emailAuthentication: {
    label: "Authentification par email",
    status: "beta",
    decision: "Le parcours existe, mais reste réservé aux tests privés.",
  },
  teamWorkspaces: {
    label: "Équipes et espaces de travail",
    status: "beta",
    decision:
      "Le modèle RBAC multi-workspace est consolidé et reste à valider en acceptation privée.",
  },
  projectsAndEnvironments: {
    label: "Projets et environnements manuels",
    status: "beta",
    decision:
      "Les environnements persistants existent, sans cycle de vie automatique par merge request.",
  },
  selfHostedServers: {
    label: "Serveurs apportés par le client",
    status: "beta",
    decision: "La connexion et le provisionnement SSH sont testables en privé.",
  },
  gitlabDeployments: {
    label: "Déploiements GitLab",
    status: "beta",
    decision:
      "Le parcours principal existe et doit encore passer les tests d'acceptation complets.",
  },
  githubDeployments: {
    label: "Déploiements GitHub",
    status: "beta",
    decision:
      "Le parcours existe, sans être annoncé comme prêt pour la production.",
  },
  dockerImageServices: {
    label: "Services depuis une image Docker",
    status: "beta",
    decision:
      "Le déploiement d'une image unique est présent dans le moteur standard.",
  },
  managedDatabases: {
    label: "Bases de données en tant que services",
    status: "beta",
    decision:
      "Le catalogue et les parcours existent, mais restent en validation privée.",
  },
  serviceTemplates: {
    label: "Modèles de services en un clic",
    status: "beta",
    decision:
      "Le catalogue crée plusieurs services, encore à valider sur une infrastructure jetable.",
  },
  registryConnections: {
    label: "Connexions aux registres de conteneurs",
    status: "beta",
    decision:
      "Les parcours de configuration existent et restent limités aux tests privés.",
  },
  customDomainsAndTls: {
    label: "Domaines personnalisés et TLS",
    status: "beta",
    decision:
      "Le domaine est configuré manuellement côté DNS avant l'émission du certificat.",
  },
  incomingDeployWebhooks: {
    label: "Webhooks de déploiement entrants",
    status: "beta",
    decision:
      "Les déclencheurs Git existent, sans promesse d'intégrations sortantes génériques.",
  },
  monitoring: {
    label: "Monitoring",
    status: "beta",
    decision:
      "Les écrans et collectes existent, sans engagement de disponibilité.",
  },
  browserTerminal: {
    label: "Terminal navigateur",
    status: "beta",
    decision: "Le parcours existe et reste réservé à l'environnement de test.",
  },
  deploymentLogs: {
    label: "Logs de déploiement",
    status: "beta",
    decision:
      "La consultation existe, mais le stockage durable des logs doit évoluer.",
  },
  deploymentStrategiesAndRollback: {
    label: "Stratégies de déploiement et retour arrière",
    status: "beta",
    decision:
      "Les fondations existent, sans garantie de reprise durable après redémarrage.",
  },
  serverAutomation: {
    label: "Automatisations serveur",
    status: "beta",
    decision:
      "Les exécutions Ansible sont disponibles uniquement dans le cadre des tests privés.",
  },
  slackAndEmailNotifications: {
    label: "Notifications Slack et email",
    status: "beta",
    decision:
      "La configuration globale existe, sans modèle de préférences par espace de travail.",
  },
  publicMarketingCopy: {
    label: "Contenu marketing public",
    status: "beta",
    decision:
      "Une présentation factuelle de la bêta est publiée sans promesse commerciale ni SLA.",
  },
  publicDocumentation: {
    label: "Documentation publique",
    status: "planned",
    decision:
      "La documentation historique contient des fonctions non livrées et doit être réécrite.",
  },
  publicLegalContent: {
    label: "Contenu juridique public",
    status: "planned",
    decision:
      "Les mentions et conditions doivent être validées formellement avant publication.",
  },
  publicPricing: {
    label: "Tarification publique",
    status: "planned",
    decision:
      "Les offres, prix et engagements ne sont pas encore validés commercialement.",
  },
  selfServiceBilling: {
    label: "Souscription et facturation en libre-service",
    status: "planned",
    decision:
      "Le parcours actuel ne réalise pas encore un cycle de paiement commercial complet.",
  },
  googleAuthentication: {
    label: "Authentification Google",
    status: "planned",
    decision:
      "Le bouton reste masqué tant que le parcours n'est pas configuré et validé de bout en bout.",
  },
  giteaDeployments: {
    label: "Déploiements Gitea",
    status: "planned",
    decision:
      "L'intégration Gitea ne dispose pas d'un parcours produit complet.",
  },
  managedInfrastructure: {
    label: "Infrastructure provisionnée par Sovrack",
    status: "planned",
    decision:
      "Aucun fournisseur d'infrastructure managée n'est encore intégré.",
  },
  mergeRequestPreviews: {
    label: "Environnements éphémères par merge request",
    status: "planned",
    decision: "Le cycle de vie automatique des previews n'est pas implémenté.",
  },
  dockerComposeServices: {
    label: "Services Docker Compose",
    status: "planned",
    decision: "Le moteur multi-conteneurs Compose n'est pas actif.",
  },
  workerAndCronServices: {
    label: "Services worker et cron",
    status: "planned",
    decision:
      "Les types backend ne disposent pas encore d'un parcours produit complet.",
  },
  dnsAutomation: {
    label: "Automatisation DNS",
    status: "planned",
    decision:
      "La plateforme ne pilote pas encore un fournisseur DNS de bout en bout.",
  },
  persistentVolumes: {
    label: "Volumes persistants gérés",
    status: "planned",
    decision:
      "Les enregistrements actuels ne constituent pas un stockage réellement provisionné.",
  },
  automatedBackups: {
    label: "Sauvegardes applicatives automatisées",
    status: "planned",
    decision:
      "Aucun produit de sauvegarde restaurable n'est encore livré aux utilisateurs.",
  },
  outgoingWebhooks: {
    label: "Webhooks sortants génériques",
    status: "planned",
    decision: "Les notifications HTTP génériques ne sont pas implémentées.",
  },
  discordNotifications: {
    label: "Notifications Discord",
    status: "planned",
    decision: "Aucune intégration Discord n'est encore livrée.",
  },
  personalApiTokens: {
    label: "Jetons API personnels",
    status: "planned",
    decision:
      "Le parcours de création et révocation des jetons personnels n'existe pas encore.",
  },
  publicStatusPage: {
    label: "Page de statut publique",
    status: "planned",
    decision: "Aucune page de statut publique n'est encore publiée.",
  },
} as const satisfies Record<string, ProductCapabilityDefinition>;

export type ProductCapability = keyof typeof PRODUCT_CAPABILITIES;

/**
 * Périmètre contractuel exact de la première bêta privée. Toute nouvelle entrée
 * doit faire l'objet d'une décision explicite et d'un test de non-régression.
 */
export const PRIVATE_BETA_CAPABILITIES = [
  "emailAuthentication",
  "teamWorkspaces",
  "projectsAndEnvironments",
  "selfHostedServers",
  "gitlabDeployments",
  "githubDeployments",
  "dockerImageServices",
  "managedDatabases",
  "serviceTemplates",
  "registryConnections",
  "customDomainsAndTls",
  "incomingDeployWebhooks",
  "monitoring",
  "browserTerminal",
  "deploymentLogs",
  "deploymentStrategiesAndRollback",
  "serverAutomation",
  "slackAndEmailNotifications",
  "publicMarketingCopy",
] as const satisfies readonly ProductCapability[];

/** Ces pages ne doivent jamais publier leur ancien contenu par inadvertance. */
export const VALIDATION_GATED_PUBLIC_CAPABILITIES = [
  "publicDocumentation",
  "publicLegalContent",
  "publicPricing",
] as const satisfies readonly ProductCapability[];

/** `beta` reste utilisable pendant les tests privés ; `planned` est masqué. */
export function isCapabilityEnabled(capability: ProductCapability): boolean {
  return PRODUCT_CAPABILITIES[capability].status !== "planned";
}

export function getCapabilitiesByStatus(status: ProductCapabilityStatus) {
  return (
    Object.entries(PRODUCT_CAPABILITIES) as Array<
      [ProductCapability, ProductCapabilityDefinition]
    >
  ).filter(([, definition]) => definition.status === status);
}
