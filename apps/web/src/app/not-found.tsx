import Link from "next/link";
import { Compass, Home } from "lucide-react";

/**
 * Page 404 personnalisée (remplace le 404 par défaut de Next). Rendue dans le
 * root layout → hérite du thème de l'app.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-card">
        <Compass size={28} className="text-secondary" />
      </div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-secondary">
        404
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-sm text-secondary">
        The page you are looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover"
      >
        <Home size={15} />
        Back to dashboard
      </Link>
    </div>
  );
}
