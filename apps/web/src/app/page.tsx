"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Boxes,
  Building2,
  CheckCircle2,
  GitBranch,
  LockKeyhole,
  Server,
  ShieldCheck,
  TerminalSquare,
  UserRound,
} from "lucide-react";
import MarketingFooter from "@/components/marketing/marketing-footer";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import { useAuthStore } from "@/stores/auth.store";
import { customerAppPath } from "@/shared/config/product-urls";

const capabilities = [
  {
    icon: GitBranch,
    title: "Sources Git centralisées",
    description:
      "Reliez vos dépôts GitHub ou GitLab et conservez le contexte de chaque déploiement.",
  },
  {
    icon: Server,
    title: "Vos propres serveurs",
    description:
      "Enregistrez vos VPS par SSH, vérifiez leurs capacités et préparez-les depuis un même espace.",
  },
  {
    icon: Boxes,
    title: "Déploiements Docker",
    description:
      "Configurez projets, environnements, services et variables avant de lancer une release traçable.",
  },
  {
    icon: ShieldCheck,
    title: "Domaines HTTPS",
    description:
      "Associez vos domaines et pilotez la configuration HTTPS de vos applications.",
  },
  {
    icon: TerminalSquare,
    title: "Diagnostic opérationnel",
    description:
      "Consultez les journaux et utilisez les outils d’intervention réservés aux rôles autorisés.",
  },
  {
    icon: Activity,
    title: "Suivi des opérations",
    description:
      "Visualisez l’état et l’historique de vos déploiements sans perdre le lien avec le projet concerné.",
  },
];

const steps = [
  {
    number: "01",
    title: "Créez votre espace",
    description:
      "Choisissez un espace personnel pour travailler seul ou une organisation pour collaborer.",
  },
  {
    number: "02",
    title: "Reliez Git et votre VPS",
    description:
      "Ajoutez les accès nécessaires, vérifiez le serveur puis décrivez votre application.",
  },
  {
    number: "03",
    title: "Validez puis déployez",
    description:
      "Contrôlez la configuration, lancez le déploiement et suivez chaque étape dans Sovrack.",
  },
];

const integrations = [
  "GitHub",
  "GitLab",
  "Docker",
  "Registres privés",
  "VPS Ubuntu",
  "Domaines HTTPS",
];

const questions = [
  {
    question: "Où sont hébergées mes applications ?",
    answer:
      "Sur les serveurs que vous connectez à Sovrack. Vous conservez la maîtrise de l'infrastructure, des domaines et des données applicatives.",
  },
  {
    question: "Puis-je commencer seul puis inviter une équipe ?",
    answer:
      "Oui. Un espace personnel peut être converti en organisation. Les invitations et les rôles deviennent alors disponibles.",
  },
  {
    question: "Quels dépôts Git sont pris en charge ?",
    answer:
      "Sovrack prend en charge l'importation en 1 clic de vos dépôts GitHub et GitLab, ainsi que les jetons d'accès personnels (PAT) pour vos dépôts d'entreprise.",
  },
  {
    question: "Sovrack fournit-il le serveur ?",
    answer:
      "Non. Sovrack fonctionne avec votre propre VPS accessible en SSH, vérifie ses prérequis et guide sa préparation.",
  },
];

export default function LandingPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <div className="min-h-screen bg-brand text-white">
      <MarketingNavbar />

      <main>
        <section className="relative flex min-h-[calc(100svh-4rem)] items-center overflow-hidden px-4 sm:px-6 py-14 sm:py-20">
          <div className="relative mx-auto max-w-6xl text-center">
            <h1 className="mx-auto max-w-5xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
              Déployez vos applications sur vos propres serveurs.
            </h1>
            <p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-slate-300 sm:text-xl">
              Sovrack centralise la connexion à Git, la préparation de vos
              VPS, les déploiements Docker, les domaines HTTPS, les journaux et
              le suivi opérationnel. Vous gardez la maîtrise de votre
              infrastructure depuis un espace unique.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link
                href={customerAppPath(
                  isAuthenticated ? "/dashboard" : "/register",
                )}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-3.5 font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:brightness-110"
              >
                {isAuthenticated ? "Ouvrir mon espace" : "Créer un compte"}
                <ArrowRight size={17} />
              </Link>
              {!isAuthenticated && (
                <Link
                  href={customerAppPath("/login")}
                  className="rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 font-semibold text-white transition hover:bg-white/10"
                >
                  Se connecter
                </Link>
              )}
            </div>
            <p className="mt-5 text-sm text-slate-400">
              Commencez avec un projet et un serveur. Aucune carte bancaire
              n’est demandée.
            </p>
          </div>
        </section>

        <section id="plateforme" className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-300">
                Une console, un flux cohérent
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
                Du dépôt au serveur, sans perdre le contexte.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-400">
                Sovrack organise les éléments nécessaires au déploiement et
                conserve une séparation claire entre identité, espace de
                travail, projet et environnement.
              </p>
            </div>
            <div
              id="features"
              className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3"
            >
              {capabilities.map(({ icon: Icon, title, description }) => (
                <article
                  key={title}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                    <Icon size={21} />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
                <UserRound className="text-cyan-300" size={30} />
                <h2 className="mt-6 text-2xl font-bold">Démarrez seul en 1 minute</h2>
                <p className="mt-3 leading-7 text-slate-300">
                  Un espace personnel sans aucune friction. Pas de formulaires superflus :
                  déployez votre premier conteneur sur votre serveur en quelques clics.
                </p>
              </article>
              <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
                <Building2 className="text-sky-300" size={30} />
                <h2 className="mt-6 text-2xl font-bold">Évoluez en équipe quand vous voulez</h2>
                <p className="mt-3 leading-7 text-slate-300">
                  Besoin de collaborer ? Créez des organisations depuis votre tableau de bord,
                  invitez vos collaborateurs et gérez finement les permissions d&apos;accès par rôle.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-3xl font-bold tracking-tight sm:text-5xl">
              Un parcours lisible en trois étapes
            </h2>
            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {steps.map((step) => (
                <article
                  key={step.number}
                  className="rounded-2xl border border-white/10 p-7"
                >
                  <span className="font-mono text-sm font-bold text-cyan-300">
                    {step.number}
                  </span>
                  <h3 className="mt-5 text-xl font-semibold">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {step.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-300">
                  Écosystème compatible
                </p>
                <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
                  Vos outils, votre infrastructure.
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-400">
                  Connectez vos sources, votre registre et votre VPS sans
                  déplacer l’hébergement de votre application vers une
                  infrastructure imposée.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {integrations.map((integration) => (
                  <div
                    key={integration}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-slate-200"
                  >
                    <CheckCircle2 className="text-cyan-300" size={19} />
                    <span className="font-medium">{integration}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 py-24">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
            <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
              <LockKeyhole className="text-cyan-300" size={30} />
              <h2 className="mt-6 text-2xl font-bold">
                Des accès séparés et maîtrisés
              </h2>
              <p className="mt-3 leading-7 text-slate-300">
                Les comptes clients, les organisations et le back-office sont
                isolés. Les secrets sensibles sont chiffrés et les actions sont
                limitées par des rôles explicites.
              </p>
            </article>
            <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
              <Server className="text-cyan-300" size={30} />
              <h2 className="mt-6 text-2xl font-bold">
                Un serveur prêt pour Docker
              </h2>
              <p className="mt-3 leading-7 text-slate-300">
                Utilisez un VPS Ubuntu accessible en SSH avec un utilisateur
                autorisé à exécuter les opérations d’administration nécessaires.
                Sovrack contrôle les prérequis avant le premier déploiement.
              </p>
            </article>
          </div>
        </section>

        <section className="px-6 py-24">
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-300">
                Questions fréquentes
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
                L’essentiel avant de commencer
              </h2>
            </div>
            <div className="mt-12 space-y-4">
              {questions.map((item) => (
                <article
                  key={item.question}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
                >
                  <h3 className="text-lg font-semibold">{item.question}</h3>
                  <p className="mt-2 leading-7 text-slate-400">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-24 text-center">
          <div className="mx-auto max-w-4xl rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-sky-500/10 to-cyan-400/5 px-8 py-14">
            <h2 className="text-3xl font-bold sm:text-4xl">
              Prêt à lancer votre premier déploiement&nbsp;?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-400">
              Créez votre espace, connectez un dépôt et préparez votre serveur
              depuis une console unique.
            </p>
            <Link
              href={customerAppPath(
                isAuthenticated ? "/dashboard" : "/register",
              )}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-50"
            >
              {isAuthenticated ? "Ouvrir mon espace" : "Créer un compte"}
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
