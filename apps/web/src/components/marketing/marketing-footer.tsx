import Link from "next/link";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";
import { SovrackLogo } from "./sovrack-logo";

export default function MarketingFooter() {
  const publicMarketingEnabled = isCapabilityEnabled("publicMarketingCopy");
  const publicDocumentationEnabled = isCapabilityEnabled("publicDocumentation");
  const publicPricingEnabled = isCapabilityEnabled("publicPricing");

  return (
    <footer className="border-t border-white/10 bg-brand pb-10 pt-14 text-slate-300">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-6">
          <div className="lg:col-span-2">
                        <div className="mb-4 flex items-center gap-2.5">
              <SovrackLogo
                size={64}
                className="-rotate-12 drop-shadow-[0_0_20px_rgba(0,229,255,0.55)]"
              />
              <span className="text-lg font-extrabold tracking-tight text-white">
                Deploy<span className="text-sky-300">Arc</span>
              </span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-slate-400">
              {publicMarketingEnabled
                ? "La plateforme de déploiement automatisé pour vos sites, APIs, bases de données et services Docker."
                : "Produit en cours de développement privé et de validation fonctionnelle."}
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-white">Produit</h4>
            <ul className="space-y-3 text-sm">
              {publicPricingEnabled && (
                <li><Link href="/pricing" className="transition hover:text-sky-300">Tarifs</Link></li>
              )}
              <li><Link href="/register" className="transition hover:text-sky-300">Créer un compte</Link></li>
              <li><Link href="/login" className="transition hover:text-sky-300">Connexion</Link></li>
              <li><Link href="/" className="transition hover:text-sky-300">Accueil</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-white">Ressources</h3>
            <ul className="space-y-3 text-sm">
              {publicDocumentationEnabled && (
                <li><Link href="/docs" className="transition hover:text-sky-300">Documentation</Link></li>
              )}
              <li><Link href="/legal" className="transition hover:text-sky-300">Mentions légales</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-white">Contact</h3>
            <ul className="space-y-3 text-sm">
              <li><a href="mailto:contact@sovrack.tech" className="transition hover:text-sky-300">contact@sovrack.tech</a></li>
              <li>Tunis, Tunisie</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Sovrack. Tous droits réservés.</p>
          <div className="flex items-center gap-6">
            <Link href="/legal" className="transition hover:text-sky-300">Confidentialité</Link>
            <a href="mailto:contact@sovrack.tech" className="transition hover:text-sky-300">Support</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
