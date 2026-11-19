"use client";

import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { useI18n } from "@/shared/i18n/language-context";
import { customerAppPath } from "@/shared/config/product-urls";

export default function BillingSuccessPage() {
  const { lang } = useI18n();
  const isEn = lang === "en";

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-3xl border border-cyan-400/30 bg-gradient-to-b from-sky-950/40 via-brand-light to-brand-light p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/40 bg-cyan-500/10 text-cyan-300 shadow-[0_0_24px_rgba(6,182,212,0.3)]">
          <CheckCircle2 className="h-9 w-9" />
        </div>

        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-white">
          {isEn ? "Payment Confirmed!" : "Paiement Confirmé !"}
        </h1>

        <p className="mt-3 text-base leading-relaxed text-slate-300">
          {isEn
            ? "Your subscription has been activated successfully. Your fleet and project limits have been upgraded immediately."
            : "Votre abonnement a été activé avec succès. Les quotas de vos serveurs et projets ont été immédiatement mis à niveau."}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href={customerAppPath("/dashboard")}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110"
          >
            {isEn ? "Go to Dashboard" : "Aller au Tableau de bord"}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={customerAppPath("/settings/billing")}
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            {isEn ? "View Invoices" : "Voir mes factures"}
          </Link>
        </div>
      </div>
    </div>
  );
}
