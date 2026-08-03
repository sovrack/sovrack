"use client";

import { useCallback, useEffect, useState } from "react";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";

type Status = "checking" | "operational" | "down";

const API_BASE_URL = "/backend-api";

export default function StatusPage() {
  const [apiStatus, setApiStatus] = useState<Status>("checking");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const check = useCallback(async () => {
    setApiStatus("checking");
    try {
      const res = await fetch(`${API_BASE_URL}/health`, { cache: "no-store" });
      if (!res.ok) {
        setApiStatus("down");
        return;
      }
      const data = (await res.json()) as { status?: string };
      setApiStatus(data.status === "ok" ? "operational" : "down");
    } catch {
      setApiStatus("down");
    }
    setCheckedAt(new Date());
  }, []);

  useEffect(() => {
    void check();
    const interval = setInterval(() => void check(), 60000);
    return () => clearInterval(interval);
  }, [check]);

  const items = [
    { name: "Plateforme (API)", status: apiStatus },
    { name: "Site web", status: "operational" as Status },
    { name: "Base de données", status: apiStatus },
  ];

  return (
    <div className="min-h-screen bg-white">
      <MarketingNavbar />

      <section className="mx-auto max-w-2xl px-6 pb-24 pt-16">
        <h1 className="text-4xl font-bold">Statut du service</h1>
        <p className="mt-3 text-slate-500">
          État en temps réel de la plateforme Sovrack.{" "}
          {checkedAt && (
            <span className="text-xs text-slate-400">
              Dernière vérification :{" "}
              {checkedAt.toLocaleTimeString("fr-FR")}
            </span>
          )}
        </p>

        <div className="mt-10 space-y-4">
          {items.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5"
            >
              <span className="font-medium text-slate-800">{item.name}</span>
              {item.status === "checking" ? (
                <span className="inline-flex items-center gap-2 text-sm text-slate-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />{" "}
                  Vérification...
                </span>
              ) : item.status === "operational" ? (
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-green-600">
                  <span className="h-2 w-2 rounded-full bg-green-500" />{" "}
                  Opérationnel
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-red-600">
                  <span className="h-2 w-2 rounded-full bg-red-500" />{" "}
                  Indisponible
                </span>
              )}
            </div>
          ))}
        </div>

        <p className="mt-8 text-sm text-slate-500">
          Un incident ? Contactez-nous :{" "}
          <a
            href="mailto:support@sovrack.tn"
            className="font-semibold text-blue-600 hover:text-blue-700"
          >
            support@sovrack.tn
          </a>
        </p>
      </section>

      <MarketingFooter />
    </div>
  );
}
