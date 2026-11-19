"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";
import { customerAppPath } from "@/shared/config/product-urls";

const included = [
  "1 projet",
  "1 serveur",
  "Espace personnel ou organisation",
  "Jusqu'à 3 membres dans une organisation",
  "GitHub et GitLab",
  "Déploiements Docker",
  "Domaines HTTPS",
  "Logs et suivi opérationnel",
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-brand text-white">
      <MarketingNavbar />

      <main className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-300">
            Tarification
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">
            Commencez gratuitement.
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-300">
            L’accès actuel ne demande ni carte bancaire ni abonnement payant.
            Les limites sont affichées clairement avant la création de vos
            ressources.
          </p>
        </div>

        <section className="mx-auto mt-14 max-w-3xl rounded-3xl border border-cyan-300/25 bg-white/[0.03] p-8 sm:p-10">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Accès gratuit</h2>
              <p className="mt-2 text-slate-400">
                Pour déployer un premier projet sur votre propre serveur.
              </p>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-5xl font-bold">0 DT</span>
              <p className="mt-1 text-sm text-slate-400">sans carte bancaire</p>
            </div>
          </div>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {included.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-3 text-slate-200"
              >
                <CheckCircle2
                  className="mt-0.5 shrink-0 text-cyan-300"
                  size={18}
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          <Link
            href={customerAppPath("/register")}
            className="mt-9 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-3.5 font-semibold text-white transition hover:brightness-110"
          >
            Créer un compte
          </Link>
        </section>

        <section className="mx-auto mt-8 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <h2 className="text-lg font-semibold">Un besoin particulier ?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Pour discuter de limites supplémentaires ou d’un accompagnement,
            écrivez-nous. Aucun plan payant n’est activé automatiquement.
          </p>
          <a
            href="mailto:contact@sovrack.tech?subject=Demande%20Sovrack"
            className="mt-4 inline-flex font-semibold text-cyan-300 hover:text-cyan-200"
          >
            contact@sovrack.tech
          </a>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
