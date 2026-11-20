"use client";

import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";

const sections = [
  {
    id: "compte",
    title: "1. Créer votre compte",
    steps: [
      "Créez un compte avec votre nom, votre adresse email et un mot de passe robuste.",
      "Votre espace personnel est prêt immédiatement. Vous pouvez créer ou rejoindre une organisation à tout moment depuis le tableau de bord.",
      "Saisissez le code reçu par email afin d'activer votre identité.",
      "La connexion s'effectue ensuite avec votre email et votre mot de passe.",
      "Vous pouvez activer volontairement une application TOTP dans Mon compte ; cette protection reste facultative.",
    ],
  },
  {
    id: "espaces",
    title: "2. Comprendre les espaces de travail",
    steps: [
      "Un espace personnel appartient à une seule personne et ne permet pas d'inviter des membres.",
      "Une organisation permet d'inviter des membres et de leur attribuer des rôles.",
      "Vous pouvez appartenir à plusieurs organisations tout en conservant votre espace personnel.",
      "La conversion d'un espace personnel en organisation est explicite et irréversible.",
    ],
  },
  {
    id: "serveur",
    title: "3. Connecter un serveur (VPS Global ou Tunisie)",
    steps: [
      "Compatible avec tout VPS Ubuntu : hébergeurs locaux en Tunisie (OxaHost, NovaHoster, Safozi payables en Dinars TND) ou internationaux (Hetzner, OVH, DigitalOcean, AWS).",
      "Ouvrez Serveurs, puis indiquez le nom, l'adresse IP, le port SSH et l'utilisateur disposant des droits sudo.",
      "Installez la clé publique indiquée par Sovrack dans ~/.ssh/authorized_keys sur le serveur cible.",
      "Lancez la validation SSH, la détection des capacités et la préparation guidée en 1 clic.",
    ],
  },
  {
    id: "git",
    title: "4. Connecter GitHub ou GitLab",
    steps: [
      "Connectez votre compte GitHub ou GitLab en 1 clic pour lister et importer vos dépôts directement.",
      "Vous pouvez également utiliser un Personal Access Token (PAT) ou un Deploy Token pour vos dépôts privés d'entreprise.",
      "Ajoutez le fournisseur depuis Fournisseurs Git et vérifiez la connexion instantanément.",
      "Les jetons sont chiffrés avec AES-256-GCM ; révoquez-les directement chez le fournisseur lorsqu'ils ne sont plus utilisés.",
    ],
  },
  {
    id: "service",
    title: "5. Créer et déployer un service",
    steps: [
      "Créez un projet et au moins un environnement persistant.",
      "Ajoutez une application construite depuis un Dockerfile ou une image Docker.",
      "Vous pouvez aussi ajouter PostgreSQL, Redis, MySQL, MongoDB ou RabbitMQ ; Sovrack génère et chiffre leurs identifiants.",
      "Ces bases sont des conteneurs exécutés sur votre propre serveur : vous restez responsable des sauvegardes, des restaurations, de la capacité disque et de la haute disponibilité.",
      "Configurez la branche, le port, les variables et les secrets nécessaires.",
      "Sélectionnez un serveur préparé, contrôlez le résumé puis lancez le déploiement.",
    ],
  },
  {
    id: "registre",
    title: "6. Utiliser un registre privé",
    steps: [
      "Ouvrez Registre depuis les intégrations de votre espace.",
      "Ajoutez l'adresse du registre et des identifiants limités à la lecture lorsque cela suffit.",
      "Référencez ensuite l'image complète dans la configuration du service.",
      "Après rotation d'un secret côté fournisseur, mettez également à jour la connexion dans Sovrack.",
    ],
  },
  {
    id: "secrets",
    title: "7. Variables et secrets",
    steps: [
      "Ajoutez les valeurs propres à chaque environnement dans l'onglet Variables.",
      "Utilisez les champs secrets pour les mots de passe, clés et jetons.",
      "Ne placez jamais un secret directement dans le dépôt Git ou dans le nom d'une variable.",
      "Contrôlez l'aperçu avant chaque déploiement sans exposer la valeur des secrets.",
    ],
  },
  {
    id: "domaine",
    title: "8. Domaine et HTTPS",
    steps: [
      "Ajoutez le nom de domaine dans la configuration du service.",
      "Créez un enregistrement A vers l’IPv4 du serveur. Pour app.sovrack.com, le champ sous-domaine est app ; pour staff.sovrack.com, il est staff.",
      "N’ajoutez un enregistrement AAAA que si ce même serveur possède une IPv6 publique fonctionnelle et que le proxy écoute réellement en IPv6. Une mauvaise valeur AAAA provoque des pannes intermittentes chez les visiteurs utilisant IPv6.",
      "Attendez la propagation DNS puis relancez la vérification dans Sovrack.",
      "L'émission HTTPS ne peut réussir que lorsque le domaine pointe vers le bon serveur et que les ports web sont accessibles.",
    ],
  },
  {
    id: "suivi",
    title: "9. Suivre un déploiement",
    steps: [
      "La page Déploiements présente l'état, le déclencheur, le projet et l'environnement.",
      "Ouvrez un déploiement pour consulter ses étapes et ses journaux.",
      "Les métriques disponibles dépendent de la configuration du serveur cible.",
      "En cas d'échec, corrigez la configuration puis lancez un nouveau déploiement traçable.",
    ],
  },
  {
    id: "securite",
    title: "10. Sécurité et assistance",
    steps: [
      "Utilisez un mot de passe unique et protégez l'accès à votre messagerie.",
      "Révoquez immédiatement une clé SSH ou un jeton Git que vous pensez compromis.",
      "Les rôles limitent les actions au niveau de l'espace de travail et du projet.",
      "Pour toute question, contactez contact@sovrack.com sans transmettre de mot de passe ni de secret.",
    ],
  },
  {
    id: "roles",
    title: "11. Rôles d’une organisation",
    steps: [
      "Le propriétaire contrôle l’organisation, les membres, les rôles et la facturation. Il doit toujours rester au moins un propriétaire actif.",
      "L’administrateur gère les membres et les ressources, sans pouvoir retirer les protections réservées au propriétaire.",
      "Le membre utilise les projets et ressources auxquels son rôle lui donne accès ; il ne peut pas inviter d’autres personnes.",
      "Un membre peut quitter une organisation. Quitter retire immédiatement ses droits sans supprimer les ressources de l’organisation.",
    ],
  },
  {
    id: "responsabilites",
    title: "12. Responsabilités d’exploitation",
    steps: [
      "Sovrack orchestre les déploiements ; le propriétaire du serveur reste responsable du fournisseur VPS, du système, du réseau et de la capacité disque.",
      "Sauvegardez les volumes et bases de données selon vos objectifs de reprise, puis testez régulièrement une restauration.",
      "Surveillez l’expiration du domaine, les quotas du fournisseur, les journaux, les erreurs et l’espace disque.",
      "Avant une modification risquée, disposez d’une sauvegarde vérifiée et d’un chemin de retour documenté.",
    ],
  },
  {
    id: "depannage",
    title: "13. Diagnostic rapide",
    steps: [
      "Échec SSH : vérifiez l’adresse, le port, l’utilisateur, la clé autorisée et les règles du pare-feu.",
      "Domaine inaccessible : vérifiez A et AAAA séparément, la propagation DNS, les ports 80/443 et l’état du proxy.",
      "Build en échec : ouvrez le déploiement, lisez les premières erreurs du journal et contrôlez le Dockerfile, la branche et les variables.",
      "Image privée refusée : testez les identifiants du registre et vérifiez qu’ils autorisent la lecture du dépôt concerné.",
      "Ne transmettez jamais de clé SSH, jeton Git, mot de passe ou secret dans une demande d’assistance.",
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-app">
      <MarketingNavbar />

      <section className="mx-auto max-w-3xl px-6 pb-24 pt-16">
        <h1 className="text-4xl font-bold text-primary">Documentation</h1>
        <p className="mt-3 text-secondary">
          Tout ce qu&apos;il faut savoir pour démarrer avec Sovrack.
        </p>

        <div className="mt-8 rounded-lg border border-accent/30 bg-accent/10 p-6 text-sm leading-6 text-secondary">
          <p className="font-semibold text-primary">Prérequis recommandés</p>
          <p className="mt-2">
            Un VPS Ubuntu à jour, accessible en SSH, avec une IPv4 publique, des
            ports 80/443 ouverts, un domaine sous votre contrôle et un dépôt Git
            ou une image Docker. Conservez toujours un accès direct au
            fournisseur VPS en cas d’erreur réseau.
          </p>
        </div>

        <nav
          aria-label="Sommaire de la documentation"
          className="mt-8 grid gap-2 rounded-lg border border-border bg-card p-5 sm:grid-cols-2"
        >
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-lg px-3 py-2 text-sm text-secondary transition hover:bg-hover/10 hover:text-primary"
            >
              {section.title}
            </a>
          ))}
        </nav>

        <div className="mt-12 space-y-10">
          {sections.map((s) => (
            <div
              key={s.title}
              id={s.id}
              className="rounded-lg border border-border bg-card p-8"
            >
              <h2 className="text-xl font-bold text-primary">{s.title}</h2>
              <ol className="mt-4 space-y-3">
                {s.steps.map((step, i) => (
                  <li
                    key={step}
                    className="flex items-start gap-3 text-sm leading-relaxed text-secondary"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/10 text-xs font-bold text-accent">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-lg border border-border bg-card p-8 text-center">
          <h2 className="text-xl font-bold text-primary">Une question ?</h2>
          <p className="mt-2 text-sm text-secondary">
            Notre équipe vous répond par email.
          </p>
          <a
            href="mailto:contact@sovrack.com"
            className="mt-5 inline-block rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover"
          >
            Contacter le support
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
