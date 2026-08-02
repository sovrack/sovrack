import Link from 'next/link'

export default function MarketingFooter() {
  return (
    <footer className="bg-gradient-to-b from-slate-900 to-blue-950 pb-8 pt-16 text-slate-300">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-6 text-sm md:grid-cols-4">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-lg font-bold text-transparent">Sovrack</span>
          </div>
          <p className="text-slate-400">Votre plateforme de déploiement automatisé, prête en 2 minutes.</p>
        </div>
        <div>
          <h4 className="mb-3 font-semibold text-white">Produit</h4>
          <ul className="space-y-2 text-slate-400">
            <li><Link href="/pricing" className="transition hover:text-white">Tarifs</Link></li>
            <li><Link href="/login" className="transition hover:text-white">Créer un compte</Link></li>
            <li><Link href="/login" className="transition hover:text-white">Connexion</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-semibold text-white">Ressources</h4>
          <ul className="space-y-2 text-slate-400">
            <li><Link href="/docs" className="transition hover:text-white">Documentation</Link></li>
            <li><Link href="/status" className="transition hover:text-white">Statut du service</Link></li>
            <li><Link href="/legal" className="transition hover:text-white">Conditions &amp; confidentialité</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-semibold text-white">Contact</h4>
          <ul className="space-y-2 text-slate-400">
            <li><a href="mailto:support@sovrack.tn" className="transition hover:text-white">support@sovrack.tn</a></li>
            <li><span>Tunis, Tunisie</span></li>
          </ul>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 py-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <span className="text-slate-300">Tous les systèmes opérationnels</span>
            <Link href="/status" className="ml-auto font-semibold text-blue-400 hover:text-blue-300">Voir</Link>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-7xl border-t border-slate-800 px-6 pt-6 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} Sovrack. Tous droits réservés.
      </div>
    </footer>
  )
}
