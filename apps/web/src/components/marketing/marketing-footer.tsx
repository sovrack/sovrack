import Link from "next/link";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";
import { customerAppPath, publicSitePath } from "@/shared/config/product-urls";
import { SovrackLogo } from "@/shared/ui/sovrack-logo";

export default function MarketingFooter() {
  const publicMarketingEnabled = isCapabilityEnabled("publicMarketingCopy");
  const publicDocumentationEnabled = isCapabilityEnabled("publicDocumentation");
  const publicPricingEnabled = isCapabilityEnabled("publicPricing");

  return (
    <footer className="bg-app pb-10 pt-14 text-secondary">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Link
              href={publicSitePath("/")}
              className="group mb-4 flex items-center gap-2.5 transition-opacity hover:opacity-90"
            >
              <SovrackLogo
                className="w-7 h-7 text-primary shrink-0"
              />
              <span className="text-[18px] font-semibold tracking-[-0.02em] text-primary antialiased">
                Sovrack
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-secondary">
              {publicMarketingEnabled
                ? "Déployez et exploitez vos applications Docker sur vos propres serveurs, depuis un espace unique."
                : "Déployez vos applications sur vos propres serveurs."}
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-primary">Produit</h4>
            <ul className="space-y-3 text-sm">
              {publicPricingEnabled && (
                <li>
                  <Link
                    href={publicSitePath("/pricing")}
                    className="transition hover:text-accent"
                  >
                    Tarifs
                  </Link>
                </li>
              )}
              <li>
                <Link
                  href={customerAppPath("/register")}
                  className="transition hover:text-accent"
                >
                  Créer un compte
                </Link>
              </li>
              <li>
                <Link
                  href={customerAppPath("/login")}
                  className="transition hover:text-accent"
                >
                  Connexion
                </Link>
              </li>
              <li>
                <Link
                  href={publicSitePath("/")}
                  className="transition hover:text-accent"
                >
                  Accueil
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-primary">
              Ressources
            </h3>
            <ul className="space-y-3 text-sm">
              {publicDocumentationEnabled && (
                <li>
                  <Link
                    href={publicSitePath("/docs")}
                    className="transition hover:text-accent"
                  >
                    Documentation
                  </Link>
                </li>
              )}
              <li>
                <Link
                  href={publicSitePath("/security")}
                  className="transition hover:text-accent"
                >
                  Sécurité
                </Link>
              </li>
              <li>
                <Link
                  href={publicSitePath("/status")}
                  className="transition hover:text-accent"
                >
                  État des services
                </Link>
              </li>
              <li>
                <Link
                  href={publicSitePath("/legal")}
                  className="transition hover:text-accent"
                >
                  Mentions légales
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-primary">Contact</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="mailto:contact@sovrack.com"
                  className="transition hover:text-accent"
                >
                  contact@sovrack.com
                </a>
              </li>
              <li>Tunis, Tunisie</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 pt-6 text-xs text-muted sm:flex-row">
          <p>
            &copy; {new Date().getFullYear()} Sovrack. Tous droits réservés.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:justify-end">
            <Link
              href={publicSitePath("/terms")}
              className="transition hover:text-accent"
            >
              Conditions
            </Link>
            <Link
              href={publicSitePath("/privacy")}
              className="transition hover:text-accent"
            >
              Confidentialité
            </Link>
            <Link
              href={publicSitePath("/cookies")}
              className="transition hover:text-accent"
            >
              Cookies
            </Link>
            <Link
              href={publicSitePath("/acceptable-use")}
              className="transition hover:text-accent"
            >
              Utilisation acceptable
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
