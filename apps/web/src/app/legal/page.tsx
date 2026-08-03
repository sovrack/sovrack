"use client";

import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";
import Link from "next/link";

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-white">
      <MarketingNavbar />

      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold text-slate-900">Mentions légales</h1>
        <p className="mt-4 text-slate-600">
          Dernière mise à jour : {new Date().toLocaleDateString("fr-FR")}
        </p>

        <section className="mt-12 space-y-8">
          <article>
            <h2 className="text-xl font-semibold text-slate-900">1. Éditeur du site</h2>
            <p className="mt-2 text-slate-600">
              Sovrack est une plateforme de déploiement automatisé développée et exploitée par :
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-slate-600">
              <li><strong>Société :</strong> Sovrack</li>
              <li><strong>Siège social :</strong> Tunisie</li>
              <li><strong>Contact :</strong> <a href="mailto:contact@sovrack.tn" className="text-blue-600 hover:underline">contact@sovrack.tn</a></li>
            </ul>
          </article>

          <article>
            <h2 className="text-xl font-semibold text-slate-900">2. Hébergement</h2>
            <p className="mt-2 text-slate-600">
              Le site est hébergé sur une infrastructure privée gérée par Sovrack.
            </p>
          </article>

          <article>
            <h2 className="text-xl font-semibold text-slate-900">3. Propriété intellectuelle</h2>
            <p className="mt-2 text-slate-600">
              L'ensemble des éléments du site (textes, images, logos, code, design) sont la propriété exclusive de Sovrack ou font l'objet d'une autorisation d'utilisation.
              Toute reproduction, représentation, modification ou exploitation non autorisée est interdite.
            </p>
          </article>

          <article>
            <h2 className="text-xl font-semibold text-slate-900">4. Données personnelles</h2>
            <p className="mt-2 text-slate-600">
              Conformément au RGPD et à la loi tunisienne sur la protection des données, vous disposez d'un droit d'accès, de rectification, d'effacement et de portabilité de vos données.
              Pour exercer ces droits : <a href="mailto:privacy@sovrack.tn" className="text-blue-600 hover:underline">privacy@sovrack.tn</a>.
            </p>
          </article>

          <article>
            <h2 className="text-xl font-semibold text-slate-900">5. Cookies</h2>
            <p className="mt-2 text-slate-600">
              Le site utilise des cookies strictement nécessaires (session, authentification, préférences de thème).
              Aucun cookie publicitaire ou de suivi tiers n'est déposé.
            </p>
          </article>

          <article>
            <h2 className="text-xl font-semibold text-slate-900">6. Conditions d'utilisation</h2>
            <p className="mt-2 text-slate-600">
              L'utilisation de la plateforme Sovrack implique l'acceptation des <a href="/terms" className="text-blue-600 hover:underline">conditions générales d'utilisation</a>.
            </p>
          </article>

          <article>
            <h2 className="text-xl font-semibold text-slate-900">7. Responsabilité</h2>
            <p className="mt-2 text-slate-600">
              Sovrack met tout en œuvre pour assurer la disponibilité et la sécurité du service, mais ne peut être tenue responsable des interruptions indépendantes de sa volonté,
              des pertes de données imputables à l'utilisateur, ou de l'utilisation non conforme de la plateforme.
            </p>
          </article>

          <article>
            <h2 className="text-xl font-semibold text-slate-900">8. Droit applicable</h2>
            <p className="mt-2 text-slate-600">
              Les présentes mentions sont régies par le droit tunisien. Tout litige relève de la compétence exclusive des tribunaux tunisiens.
            </p>
          </article>
        </section>

        <div className="mt-12 pt-8 border-t border-slate-200">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour à l'accueil
          </Link>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}