import Link from "next/link";

export default function MarketingFooter() {
  return (
    <footer className="border-t border-white/10 bg-zinc-950 pb-10 pt-14 text-zinc-400">
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
            <h4 className="mb-4 text-sm font-semibold text-white">Ressources</h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="/docs" className="transition hover:text-white">Documentation</Link></li>
              <li><Link href="/status" className="transition hover:text-white">Statut du service</Link></li>
              <li><Link href="/legal" className="transition hover:text-white">Mentions légales</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-white">Contact</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="mailto:support@sovrack.tn" className="transition hover:text-white">support@sovrack.tn</a></li>
              <li>Tunis, Tunisie</li>
            </ul>
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-xs">
              <span className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-zinc-300">Tous les systèmes opérationnels</span>
              <Link href="/status" className="ml-auto font-semibold text-blue-400 hover:text-blue-300">Voir</Link>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-zinc-800 pt-6 text-xs text-zinc-500 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Sovrack. Tous droits réservés.</p>
          <div className="flex items-center gap-6">
            <Link href="/legal" className="transition hover:text-zinc-300">Confidentialité</Link>
            <Link href="/status" className="transition hover:text-zinc-300">Statut</Link>
            <a href="mailto:support@sovrack.tn" className="transition hover:text-zinc-300">Support</a>
          </div>
        </div>
      </div>
    </footer>
  );
}