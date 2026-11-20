"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import MarketingFooter from "@/components/marketing/marketing-footer";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";

type ServiceState = "checking" | "operational" | "degraded";

export default function StatusPage() {
  const [state, setState] = useState<ServiceState>("checking");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    async function check() {
      try {
        const response = await fetch("/backend-api/health/ready", {
          cache: "no-store",
        });
        if (active) setState(response.ok ? "operational" : "degraded");
      } catch {
        if (active) setState("degraded");
      } finally {
        if (active) setCheckedAt(new Date());
      }
    }

    void check();
    const interval = window.setInterval(check, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const operational = state === "operational";
  const checking = state === "checking";
  const Icon = checking ? Loader2 : operational ? CheckCircle2 : AlertTriangle;

  return (
    <div className="min-h-screen bg-app text-primary">
      <MarketingNavbar />
      <main className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
          État des services
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Disponibilité de Sovrack
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-secondary">
          Cette page vérifie en temps réel la disponibilité de l’application et
          de ses dépendances essentielles. Elle ne publie pas encore un
          historique contractuel de disponibilité.
        </p>

        <section className="mt-12 rounded-lg border border-border bg-card p-8">
          <div className="flex items-center gap-4">
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-md ${
                checking
                  ? "bg-hover/10 text-secondary"
                  : operational
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-amber-500/10 text-amber-300"
              }`}
            >
              <Icon className={checking ? "animate-spin" : ""} size={24} />
            </span>
            <div>
              <h2 className="text-xl font-semibold">
                {checking
                  ? "Vérification en cours"
                  : operational
                    ? "Tous les services essentiels sont opérationnels"
                    : "Une indisponibilité est détectée"}
              </h2>
              <p className="mt-1 text-sm text-secondary">
                Application, base de données et file de traitement
              </p>
            </div>
          </div>
          {checkedAt && (
            <p className="mt-6 border-t border-border pt-4 text-xs text-muted">
              Dernière vérification locale :{" "}
              {checkedAt.toLocaleTimeString("fr-FR")}
            </p>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Besoin d’assistance ?</h2>
          <p className="mt-2 text-sm leading-6 text-secondary">
            Si votre espace reste inaccessible alors que les services sont
            opérationnels, écrivez à contact@sovrack.com sans joindre de mot
            de passe, clé SSH ou jeton d’accès.
          </p>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
