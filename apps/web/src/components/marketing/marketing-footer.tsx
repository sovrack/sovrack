import Link from "next/link";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";
import { customerAppPath, publicSitePath } from "@/shared/config/product-urls";
import { SovrackBrand } from "@/shared/ui/sovrack-logo";
import { BRAND_CONFIG } from "@/shared/config/brand.config";

function GitHubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

function XTwitterIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function DiscordIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export default function MarketingFooter() {
  const publicDocumentationEnabled = isCapabilityEnabled("publicDocumentation");
  const publicPricingEnabled = isCapabilityEnabled("publicPricing");

  return (
    <footer className="bg-[#0a0a0a] pb-12 pt-16 text-zinc-400">
      <div className="mx-auto max-w-[1280px] px-6 sm:px-12 lg:px-24">
        {/* Grille principale inspirée de Coolify (Image 2) */}
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-6 pb-12 border-b border-zinc-800/40">
          {/* Bloc Marque (2 colonnes) */}
          <div className="lg:col-span-2 space-y-4">
            <Link
              href={publicSitePath("/")}
              className="inline-flex items-center transition-opacity hover:opacity-90"
              aria-label="Sovrack Accueil"
            >
              <SovrackBrand textClassName="text-[20px] font-semibold tracking-tight text-white" />
            </Link>
            <p className="max-w-sm text-xs leading-relaxed text-zinc-400">
              Plateforme open-core et auto-hébergeable pour déployer vos applications,
              bases de données et services sur vos propres serveurs.
            </p>
            <p className="text-[12px] text-zinc-500 font-mono pt-1">
              © {new Date().getFullYear()} Sovrack. Tous droits réservés.
            </p>
          </div>

          {/* Colonne PRODUIT */}
          <div>
            <h4 className="mb-3.5 text-xs font-mono font-medium uppercase tracking-wider text-zinc-200">
              Produit
            </h4>
            <ul className="space-y-2.5 text-xs text-zinc-400">
              <li>
                <Link href={customerAppPath("/register")} className="transition-colors hover:text-white">
                  Cloud
                </Link>
              </li>
              <li>
                <Link href={publicSitePath("/features")} className="transition-colors hover:text-white">
                  Auto-hébergé
                </Link>
              </li>
              {publicPricingEnabled && (
                <li>
                  <Link href={publicSitePath("/pricing")} className="transition-colors hover:text-white">
                    Tarifs
                  </Link>
                </li>
              )}
              <li>
                <Link href={publicSitePath("/features")} className="transition-colors hover:text-white">
                  Fonctionnalités
                </Link>
              </li>
              {publicDocumentationEnabled && (
                <li>
                  <Link href={publicSitePath("/docs")} className="transition-colors hover:text-white">
                    Documentation
                  </Link>
                </li>
              )}
              <li>
                <Link href={publicSitePath("/changelog")} className="transition-colors hover:text-white">
                  Changelog
                </Link>
              </li>
            </ul>
          </div>

          {/* Colonne GUIDES */}
          <div>
            <h4 className="mb-3.5 text-xs font-mono font-medium uppercase tracking-wider text-zinc-200">
              Guides
            </h4>
            <ul className="space-y-2.5 text-xs text-zinc-400">
              <li>
                <Link href={publicSitePath("/docs")} className="transition-colors hover:text-white">
                  Déployer sur votre VPS
                </Link>
              </li>
              <li>
                <Link href={publicSitePath("/docs")} className="transition-colors hover:text-white">
                  Postgres auto-hébergé
                </Link>
              </li>
              <li>
                <Link href={publicSitePath("/features")} className="transition-colors hover:text-white">
                  Migration PaaS vers VPS
                </Link>
              </li>
              <li>
                <Link href={publicSitePath("/features")} className="transition-colors hover:text-white">
                  Architecture conteneurs Docker
                </Link>
              </li>
              <li>
                <Link href={publicSitePath("/features")} className="transition-colors hover:text-white">
                  Sécurisation SSL &amp; Domaines
                </Link>
              </li>
              <li>
                <Link href={publicSitePath("/docs")} className="transition-colors hover:text-white">
                  Orchestration sans agent SSH
                </Link>
              </li>
            </ul>
          </div>

          {/* Colonne COMMUNAUTÉ */}
          <div>
            <h4 className="mb-3.5 text-xs font-mono font-medium uppercase tracking-wider text-zinc-200">
              Communauté
            </h4>
            <ul className="space-y-2.5 text-xs text-zinc-400">
              <li>
                <Link
                  href={BRAND_CONFIG.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  GitHub
                </Link>
              </li>
              <li>
                <Link
                  href="https://discord.gg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  Discord
                </Link>
              </li>
              <li>
                <Link href={publicSitePath("/docs")} className="transition-colors hover:text-white">
                  Contributeurs
                </Link>
              </li>
              <li>
                <Link
                  href={BRAND_CONFIG.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  Sponsor us
                </Link>
              </li>
              <li>
                <Link href={publicSitePath("/changelog")} className="transition-colors hover:text-white">
                  Roadmap
                </Link>
              </li>
            </ul>
          </div>

          {/* Colonne ENTREPRISE & LÉGAL */}
          <div>
            <h4 className="mb-3.5 text-xs font-mono font-medium uppercase tracking-wider text-zinc-200">
              Entreprise
            </h4>
            <ul className="space-y-2.5 text-xs text-zinc-400">
              <li>
                <Link href={publicSitePath("/features")} className="transition-colors hover:text-white">
                  Philosophie Open-Core
                </Link>
              </li>
              <li>
                <Link href={publicSitePath("/security")} className="transition-colors hover:text-white">
                  Sécurité
                </Link>
              </li>
              <li>
                <Link href={publicSitePath("/privacy")} className="transition-colors hover:text-white">
                  Confidentialité
                </Link>
              </li>
              <li>
                <Link href={publicSitePath("/terms")} className="transition-colors hover:text-white">
                  Conditions d&apos;utilisation
                </Link>
              </li>
              <li>
                <Link href={publicSitePath("/legal")} className="transition-colors hover:text-white">
                  Mentions légales
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Ligne inférieure : Copyright & Réseaux sociaux */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>
            Construit en Open-Core avec passion pour l&apos;autonomie des développeurs.
          </p>
          <div className="flex items-center gap-4 text-zinc-400">
            <Link
              href={BRAND_CONFIG.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 hover:text-white transition-colors"
              aria-label="GitHub"
            >
              <GitHubIcon className="h-4 w-4" />
            </Link>
            <Link
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 hover:text-white transition-colors"
              aria-label="Twitter / X"
            >
              <XTwitterIcon className="h-4 w-4" />
            </Link>
            <Link
              href="https://discord.gg"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 hover:text-white transition-colors"
              aria-label="Discord"
            >
              <DiscordIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}