import Link from "next/link";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";
import { customerAppPath, publicSitePath } from "@/shared/config/product-urls";
import { SovrackBrand } from "@/shared/ui/sovrack-logo";

export default function MarketingFooter() {
  const publicDocumentationEnabled = isCapabilityEnabled("publicDocumentation");
  const publicPricingEnabled = isCapabilityEnabled("publicPricing");

  return (
    <footer className="bg-[#0a0a0a] pb-12 pt-14 text-zinc-500">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link
              href={publicSitePath("/")}
              className="mb-4 inline-flex items-center transition-opacity hover:opacity-90"
              aria-label="Sovrack Accueil"
            >
              <SovrackBrand textClassName="text-[19px] font-medium tracking-tight text-white" />
            </Link>
            <p className="max-w-sm text-xs leading-relaxed text-zinc-500 mt-2">
              Plateforme open-core de déploiement et d&apos;orchestration de conteneurs Docker sur vos propres serveurs VPS.
            </p>
            <p className="mt-4 text-[11px] text-zinc-600 font-mono">
              © {new Date().getFullYear()} Sovrack. Tous droits réservés.
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-300">
              Produit
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  href={publicSitePath("/features")}
                  className="transition-colors hover:text-[#2563EB]"
                >
                  Fonctionnalités
                </Link>
              </li>
              {publicPricingEnabled && (
                <li>
                  <Link
                    href={publicSitePath("/pricing")}
                    className="transition-colors hover:text-[#2563EB]"
                  >
                    Tarifs
                  </Link>
                </li>
              )}
              <li>
                <Link
                  href={publicSitePath("/changelog")}
                  className="transition-colors hover:text-[#2563EB]"
                >
                  Changelog
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-300">
              Ressources
            </h4>
            <ul className="space-y-2 text-xs">
              {publicDocumentationEnabled && (
                <li>
                  <Link
                    href={publicSitePath("/docs")}
                    className="transition-colors hover:text-[#2563EB]"
                  >
                    Documentation
                  </Link>
                </li>
              )}
              <li>
                <Link
                  href={publicSitePath("/security")}
                  className="transition-colors hover:text-[#2563EB]"
                >
                  Sécurité
                </Link>
              </li>
              <li>
                <Link
                  href={publicSitePath("/status")}
                  className="transition-colors hover:text-[#2563EB]"
                >
                  État des services
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-300">
              Légal
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link
                  href={publicSitePath("/terms")}
                  className="transition-colors hover:text-[#2563EB]"
                >
                  Conditions d&apos;utilisation
                </Link>
              </li>
              <li>
                <Link
                  href={publicSitePath("/privacy")}
                  className="transition-colors hover:text-[#2563EB]"
                >
                  Confidentialité
                </Link>
              </li>
              <li>
                <Link
                  href={publicSitePath("/cookies")}
                  className="transition-colors hover:text-[#2563EB]"
                >
                  Cookies
                </Link>
              </li>
              <li>
                <Link
                  href={publicSitePath("/legal")}
                  className="transition-colors hover:text-[#2563EB]"
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
