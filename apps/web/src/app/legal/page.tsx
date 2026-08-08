"use client";

import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";
import Link from "next/link";

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-brand">
      <MarketingNavbar />

      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold text-white">Mentions légales</h1>
        <p className="mt-4 text-slate-300">
          Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}
        </p>

        <section className="mt-12 space-y-8">
          <article>
            <h2 className="text-xl font-semibold text-white">1. Éditeur du site</h2>
            <p className="mt-2 text-slate-300">
              Sovrack est une plateforme de déploiement automatisé développée et exploitée par :
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-slate-300">
              <li><strong>Société :</strong> Sovrack</li>
              <li><strong>Siège social :</strong> Tunisie</li>
              <li><strong>Contact :</strong> <a href="mailto:contact@sovrack.tech" className="text-sky-400 hover:underline">contact@sovrack.tech</a></li>
            </ul>
          </article>

          <article>
            <h2 className="text-xl font-semibold text-white">2. Hébergement</h2>
            <p className="mt-2 text-slate-300">
              Le site est hébergé sur une infrastructure privée gérée par Sovrack.
            </p>
          </article>

          <article>
            <h2 className="text-xl font-semibold text-white">3. Propriété intellectuelle</h2>
            <p className="mt-2 text-slate-300">
              L&apos;ensemble des éléments du site (textes, images, logos, code, design) sont la propriété exclusive de Sovrack ou font l&apos;objet d&apos;une autorisation d&apos;utilisation.
              Toute reproduction, représentation, modification ou exploitation non autorisée est interdite.
            </p>
          </article>

          <article>
            <h2 className="text-xl font-semibold text-white">4. Données personnelles</h2>
            <p className="mt-2 text-slate-300">
              Conformément au RGPD et à la loi tunisienne sur la protection des données, vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement et de portabilité de vos données.
              Pour exercer ces droits : <a href="mailto:privacy@sovrack.tech" className="text-sky-400 hover:underline">privacy@sovrack.tech</a>.
            </p>
          </article>

          <article>
            <h2 className="text-xl font-semibold text-white">5. Cookies</h2>
            <p className="mt-2 text-slate-300">
              Le site utilise des cookies strictement nécessaires (session, authentification, préférences de thème).
              Aucun cookie publicitaire ou de suivi tiers n&apos;est déposé.
            </p>
          </article>

          <article>
            <h2 className="text-xl font-semibold text-white">6. Conditions d&apos;utilisation</h2>
            <p className="mt-2 text-slate-300">
              L&apos;utilisation de la plateforme Sovrack implique l&apos;acceptation des <a href="/terms" className="text-sky-400 hover:underline">conditions générales d&apos;utilisation</a>.
            </p>
          </article>

          <article>
            <h2 className="text-xl font-semibold text-white">7. Responsabilité</h2>
            <p className="mt-2 text-slate-300">
              Sovrack met tout en œuvre pour assurer la disponibilité et la sécurité du service, mais ne peut être tenue responsable des interruptions indépendantes de sa volonté,
              des pertes de données imputables à l&apos;utilisateur, ou de l&apos;utilisation non conforme de la plateforme.
            </p>
          </article>

          <article>
            <h2 className="text-xl font-semibold text-white">8. Droit applicable</h2>
            <p className="mt-2 text-slate-300">
              Les présentes mentions sont régies par le droit tunisien. Tout litige relève de la compétence exclusive des tribunaux tunisiens.
            </p>
          </article>
        </section>

        <div className="mt-12 pt-8 border-t border-white/10">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour à l&apos;accueil
          </Link>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}