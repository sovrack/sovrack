import Link from "next/link";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";
import { customerAppPath, publicSitePath } from "@/shared/config/product-urls";
import { SovrackBrand } from "@/shared/ui/sovrack-logo";

export default function MarketingFooter() {
  const publicDocumentationEnabled = isCapabilityEnabled("publicDocumentation");
  const publicPricingEnabled = isCapabilityEnabled("publicPricing");

  return (
    <footer className="border-t border-border/70 bg-app pb-12 pt-14 text-zinc-400">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link
              href={publicSitePath("/")}
              className="mb-4 inline-flex items-center transition-opacity hover:opacity-90"
              aria-label="Sovrack Accueil"
            >
              <SovrackBrand textClassName="text-[16px] font-normal tracking-[-0.02em] text-white" />
            </Link>
            <p className="max-w-sm text-xs leading-relaxed text-zinc-400 mt-2">
              Plateforme open-core de déploiement et d&apos;orchestration de conteneurs Docker sur vos propres serveurs VPS.
            </p>
            <p className="mt-4 text-[11px] text-zinc-500 font-mono">
              © {new Date().getFullYear()} Sovrack. Tous droits réservés.
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-white">
              Produit
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  href={publicSitePath("/features")}
                  className="transition-colors hover:text-white"
                >
                  Fonctionnalités
                </Link>
              </li>
              <li>
                <Link
                  href={publicSitePath("/architecture")}
                  className="transition-colors hover:text-white"
                >
                  Architecture
                </Link>
              </li>
              {publicPricingEnabled && (
                <li>
                  <Link
                    href={publicSitePath("/pricing")}
                    className="transition-colors hover:text-white"
                  >
                    Tarifs
                  </Link>
                </li>
              )}
              <li>
                <Link
                  href={publicSitePath("/changelog")}
                  className="transition-colors hover:text-white"
                >
                  Changelog
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-white">
              Ressources
            </h4>
            <ul className="space-y-2 text-xs">
              {publicDocumentationEnabled && (
                <li>
                  <Link
                    href={publicSitePath("/docs")}
                    className="transition-colors hover:text-white"
                  >
                    Documentation
                  </Link>
                </li>
              )}
              <li>
                <Link
                  href={publicSitePath("/security")}
                  className="transition-colors hover:text-white"
                >
                  Sécurité
                </Link>
              </li>
              <li>
                <Link
                  href={publicSitePath("/status")}
                  className="transition-colors hover:text-white"
                >
                  État des services
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-white">
              Légal
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  href={publicSitePath("/terms")}
                  className="transition-colors hover:text-white"
                >
                  Conditions d&apos;utilisation
                </Link>
              </li>
              <li>
                <Link
                  href={publicSitePath("/privacy")}
                  className="transition-colors hover:text-white"
                >
                  Confidentialité
                </Link>
              </li>
              <li>
                <Link
                  href={publicSitePath("/cookies")}
                  className="transition-colors hover:text-white"
                >
                  Cookies
                </Link>
              </li>
              <li>
                <Link
                  href={publicSitePath("/legal")}
                  className="transition-colors hover:text-white"
                >
                  Mentions légales
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
