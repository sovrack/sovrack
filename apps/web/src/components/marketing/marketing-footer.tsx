import Link from "next/link";

export default function MarketingFooter() {
  return (
    <footer className="border-t border-blue-500/20 bg-blue-950 pb-10 pt-14 text-blue-300">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30">
                <svg className="h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </span>
              <span className="text-lg font-bold tracking-tight text-white">Sovrack</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed">
              La plateforme de déploiement automatisé pour vos sites, APIs,
              bases de données et services Docker. Prête en 2 minutes.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-white">Produit</h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/pricing" className="transition hover:text-white">Tarifs</Link></li>
              <li><Link href="/register" className="transition hover:text-white">Créer un compte</Link></li>
              <li><Link href="/login" className="transition hover:text-white">Connexion</Link></li>
              <li><Link href="/" className="transition hover:text-white">Accueil</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-white">Ressources</h3>
            <ul className="space-y-3 text-sm">
              <li><Link href="/docs" className="transition hover:text-white">Documentation</Link></li>
              <li><Link href="/legal" className="transition hover:text-white">Mentions légales</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold text-white">Contact</h3>
            <ul className="space-y-3 text-sm">
              <li><a href="mailto:contact@sovrack.tech" className="transition hover:text-white">contact@sovrack.tech</a></li>
              <li>Tunis, Tunisie</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-blue-500/20 pt-6 text-xs text-blue-400 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Sovrack. Tous droits réservés.</p>
          <div className="flex items-center gap-6">
            <Link href="/legal" className="transition hover:text-white">Confidentialité</Link>
            <a href="mailto:contact@sovrack.tech" className="transition hover:text-white">Support</a>
          </div>
        </div>
      </div>
    </footer>
  );
}