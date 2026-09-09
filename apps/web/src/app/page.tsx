"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Boxes,
  Building2,
  GitBranch,
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

export default function LandingPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <div className="min-h-screen bg-brand text-white">
      <MarketingNavbar />

      <main>
        <section className="relative overflow-hidden px-6 pb-24 pt-24 sm:pt-32">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(14,165,233,0.24),transparent_45%)]" />
          <div className="relative mx-auto max-w-6xl text-center">
            <span className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">
              Bêta privée
            </span>
            <h1 className="mx-auto mt-7 max-w-5xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
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
                {isAuthenticated
                  ? "Ouvrir mon espace"
                  : "Créer un espace de test"}
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
            <p className="mt-5 text-sm text-slate-500">
              Accès actuellement réservé aux tests contrôlés. Aucune promesse de
              disponibilité commerciale n’est annoncée pendant la bêta.
            </p>
          </div>
        </section>

        <section
          id="plateforme"
          className="border-y border-white/10 bg-white/[0.025] px-6 py-24"
        >
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
              <article className="rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.06] p-8">
                <UserRound className="text-cyan-300" size={30} />
                <h2 className="mt-6 text-2xl font-bold">Espace personnel</h2>
                <p className="mt-3 leading-7 text-slate-300">
                  Un espace réservé à une seule personne. Il ne propose ni
                  invitation ni gestion de membres, tout en conservant les
                  fonctions de projet et de déploiement.
                </p>
              </article>
              <article className="rounded-3xl border border-sky-300/20 bg-sky-300/[0.06] p-8">
                <Building2 className="text-sky-300" size={30} />
                <h2 className="mt-6 text-2xl font-bold">Organisation</h2>
                <p className="mt-3 leading-7 text-slate-300">
                  Un espace collaboratif avec invitations et rôles. Un espace
                  personnel peut être converti en organisation lorsque le besoin
                  de travailler à plusieurs apparaît.
                </p>
              </article>
            </div>
            <p className="mx-auto mt-6 max-w-3xl text-center text-sm text-slate-500">
              « Enterprise » désigne un niveau d’offre, pas un type de compte ni
              une identité différente.
            </p>
          </div>
        </section>

        <section
          id="how-it-works"
          className="border-y border-white/10 bg-white/[0.025] px-6 py-24"
        >
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

        <section className="px-6 py-24 text-center">
          <div className="mx-auto max-w-4xl rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-sky-500/10 to-cyan-400/5 px-8 py-14">
            <h2 className="text-3xl font-bold sm:text-4xl">
              Prêt à valider votre premier déploiement&nbsp;?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-400">
              La bêta sert à éprouver le parcours avec des environnements de
              test avant l’ouverture générale.
            </p>
            <Link
              href={customerAppPath(
                isAuthenticated ? "/dashboard" : "/register",
              )}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-50"
            >
              {isAuthenticated ? "Ouvrir mon espace" : "Demander un accès"}
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
