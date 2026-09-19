/**
 * Source de vérité produit pour les surfaces exposées par le frontend.
 *
 * Ce fichier ne remplace jamais les contrôles d'autorisation du backend. Il
 * empêche uniquement l'interface et le site public de présenter comme prête
 * une capacité qui ne l'est pas encore.
 */
export const PRODUCT_STAGE = "general-availability" as const;

export type ProductCapabilityStatus = "available" | "planned";

type ProductCapabilityDefinition = {
  label: string;
  status: ProductCapabilityStatus;
  decision: string;
};

export const PRODUCT_CAPABILITIES = {
  emailAuthentication: {
    label: "Authentification par email",
    status: "available",
    decision:
      "Inscription, vérification, connexion et récupération sont incluses dans la V1.",
  },
  optionalCustomerMfa: {
    label: "Double authentification client facultative",
    status: "available",
    decision:
      "La connexion par email et mot de passe reste le parcours par défaut ; chaque client peut activer volontairement un TOTP et des codes de secours.",
  },
  teamWorkspaces: {
    label: "Équipes et espaces de travail",
    status: "available",
    decision:
      "Les espaces personnels et organisations, invitations et rôles sont inclus dans la V1.",
  },
  projectsAndEnvironments: {
    label: "Projets et environnements manuels",
    status: "available",
    decision:
      "Les environnements persistants existent, sans cycle de vie automatique par merge request.",
  },
  selfHostedServers: {
    label: "Serveurs apportés par le client",
    status: "available",
    decision:
      "La connexion, la validation et la préparation SSH sont incluses dans la V1.",
  },
  gitlabDeployments: {
    label: "Déploiements GitLab",
    status: "available",
    decision: "Le parcours GitLab par jeton et dépôt est inclus dans la V1.",
  },
  githubDeployments: {
    label: "Déploiements GitHub",
    status: "available",
    decision:
      "Le parcours GitHub par Personal Access Token est inclus dans la V1.",
  },
  dockerImageServices: {
    label: "Services depuis une image Docker",
    status: "available",
    decision:
      "Le déploiement d'une image unique est présent dans le moteur standard.",
  },
  managedDatabases: {
    label: "Bases de données conteneurisées sur vos serveurs",
    status: "available",
    decision:
      "PostgreSQL, Redis, MySQL, MongoDB et RabbitMQ sont déployés sur le VPS du client avec identifiants générés et chiffrés. La sauvegarde, la haute disponibilité et la reprise restent sous la responsabilité du client.",
  },
  serviceTemplates: {
    label: "Modèles de services en un clic",
    status: "planned",
    decision:
      "Les modèles multi-services restent masqués jusqu'à validation complète.",
  },
  registryConnections: {
    label: "Connexions aux registres de conteneurs",
    status: "available",
    decision:
      "Les connexions aux registres de conteneurs sont incluses dans la V1.",
  },
  customDomainsAndTls: {
    label: "Domaines personnalisés et TLS",
    status: "available",
    decision:
      "Le domaine est configuré manuellement côté DNS avant l'émission du certificat.",
  },
  incomingDeployWebhooks: {
    label: "Webhooks de déploiement entrants",
    status: "available",
    decision:
      "Les déclencheurs Git existent, sans promesse d'intégrations sortantes génériques.",
  },
  monitoring: {
    label: "Monitoring",
    status: "available",
    decision:
      "Les métriques et états disponibles sur les serveurs configurés sont inclus dans la V1.",
  },
  browserTerminal: {
    label: "Terminal navigateur",
    status: "available",
    decision:
      "Le terminal navigateur est inclus dans la V1 pour les rôles autorisés.",
  },
  deploymentLogs: {
    label: "Logs de déploiement",
    status: "available",
    decision:
      "La consultation existe, mais le stockage durable des logs doit évoluer.",
  },
  deploymentStrategiesAndRollback: {
    label: "Stratégies de déploiement et retour arrière",
    status: "planned",
    decision:
      "Le retour arrière reste masqué tant que la reprise durable n'est pas qualifiée.",
  },
  serverAutomation: {
    label: "Automatisations serveur",
    status: "planned",
    decision:
      "L'interface et les API d'automatisation générale restent désactivées jusqu'à une validation dédiée.",
  },
  slackAndEmailNotifications: {
    label: "Notifications Slack et email",
    status: "planned",
    decision:
      "Les notifications client restent masquées jusqu'à leur isolation par espace de travail.",
  },
  publicMarketingCopy: {
    label: "Contenu marketing public",
    status: "available",
    decision:
      "Le site public décrit uniquement les fonctions disponibles dans la V1.",
  },
  publicDocumentation: {
    label: "Documentation publique",
    status: "available",
    decision:
      "La documentation V1 est publiée et limitée aux parcours réellement disponibles.",
  },
  publicLegalContent: {
    label: "Contenu juridique public",
    status: "available",
    decision:
      "Les pages d'information juridique et de confidentialité sont publiées pour la V1.",
  },
  publicPricing: {
    label: "Tarification publique",
    status: "available",
    decision:
      "La page présente l'accès gratuit V1 sans paiement ni promesse de plan payant.",
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
    status: "available",
    decision:
      "Une page publique présente l'état instantané des services essentiels.",
  },
} as const satisfies Record<string, ProductCapabilityDefinition>;

export type ProductCapability = keyof typeof PRODUCT_CAPABILITIES;

/**
 * Périmètre contractuel exact de la V1 publique. Toute nouvelle entrée
 * doit faire l'objet d'une décision explicite et d'un test de non-régression.
 */
export const V1_CAPABILITIES = [
  "emailAuthentication",
  "optionalCustomerMfa",
  "teamWorkspaces",
  "projectsAndEnvironments",
  "selfHostedServers",
  "gitlabDeployments",
  "githubDeployments",
  "dockerImageServices",
  "managedDatabases",
  "registryConnections",
  "customDomainsAndTls",
  "incomingDeployWebhooks",
  "monitoring",
  "browserTerminal",
  "deploymentLogs",
  "publicMarketingCopy",
  "publicDocumentation",
  "publicLegalContent",
  "publicPricing",
  "publicStatusPage",
] as const satisfies readonly ProductCapability[];

/** Une capacité planifiée reste masquée de toutes les surfaces publiques. */
export function isCapabilityEnabled(capability: ProductCapability): boolean {
  return PRODUCT_CAPABILITIES[capability].status === "available";
}

export function getCapabilitiesByStatus(status: ProductCapabilityStatus) {
  return (
    Object.entries(PRODUCT_CAPABILITIES) as Array<
      [ProductCapability, ProductCapabilityDefinition]
    >
  ).filter(([, definition]) => definition.status === status);
}
