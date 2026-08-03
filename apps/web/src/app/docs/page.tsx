"use client";

import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";

const sections = [
  {
    title: "Créer un compte",
    steps: [
      "Rendez-vous sur la page de connexion et créez votre compte.",
      "Connectez-vous avec votre email et votre mot de passe.",
      "Votre équipe (workspace) est créée automatiquement.",
      "Vous profitez de 14 jours d'essai gratuit du plan Free.",
    ],
  },
  {
    title: "Connecter un serveur",
    steps: [
      "Ouvrez la section Servers depuis le menu latéral.",
      "Créez un serveur : nom, hôte et clé SSH (ou laissez la plateforme générer la paire de clés).",
      "Installez la clé publique sur l'hôte via la commande fournie.",
      "La plateforme vérifie la connexion et détecte Docker automatiquement.",
    ],
  },
  {
    title: "Déployer une application",
    steps: [
      "Créez un projet depuis le dashboard.",
      "Connectez votre dépôt Git (GitHub ou GitLab).",
      "Choisissez votre type de service (statique, backend, base de données, Docker).",
      "Chaque push Git déclenche un déploiement automatique, SSL inclus.",
    ],
  },
  {
    title: "Gérer vos équipes et projets",
    steps: [
      "Ajoutez des membres à votre équipe depuis la section équipes.",
      "Chaque membre voit les projets auxquels il est associé.",
      "Les environnements (production, staging, preview) sont créés par projet.",
      "Les rôles définissent ce que chaque membre peut faire sur un projet.",
    ],
  },
  {
    title: "Sécurité et sauvegardes",
    steps: [
      "Chaque serveur est isolé dans son propre réseau Docker.",
      "Vos données sont sauvegardées selon votre plan (rétention jusqu'à 365 jours).",
      "Les ports de base de données sont exposés uniquement en local sur le serveur.",
      "Votre session utilise un cookie sécurisé (httpOnly), et votre mot de passe est stocké haché.",
    ],
  },
  {
    title: "Facturation",
    steps: [
      "Depuis votre espace, ouvrez la section Facturation.",
      "Choisissez le plan qui correspond à vos besoins (Free, Starter, Pro, Enterprise).",
      "Les limites (projets, serveurs, membres) s'appliquent immédiatement.",
      "Chaque changement de plan génère une facture, visible dans votre espace.",
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNavbar />

      <section className="mx-auto max-w-3xl px-6 pb-24 pt-16">
        <h1 className="text-4xl font-bold">Documentation</h1>
        <p className="mt-3 text-slate-500">
          Tout ce qu&apos;il faut savoir pour démarrer avec Sovrack.
        </p>

        <div className="mt-12 space-y-10">
          {sections.map((s) => (
            <div
              key={s.title}
              className="rounded-2xl border border-slate-200 bg-white p-8"
            >
              <h2 className="text-xl font-bold">{s.title}</h2>
              <ol className="mt-4 space-y-3">
                {s.steps.map((step, i) => (
                  <li
                    key={step}
                    className="flex items-start gap-3 text-sm leading-relaxed text-slate-600"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-center">
          <h2 className="text-xl font-bold text-white">Une question ?</h2>
          <p className="mt-2 text-sm text-blue-100">
            Notre équipe vous répond par email.
          </p>
          <a
            href="mailto:support@sovrack.tn"
            className="mt-5 inline-block rounded-xl bg-white px-6 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
          >
            Contacter le support
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
