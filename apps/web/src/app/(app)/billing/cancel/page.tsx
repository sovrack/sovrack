"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { useI18n } from "@/shared/i18n/language-context";
import { customerAppPath } from "@/shared/config/product-urls";

export default function BillingCancelPage() {
  const { lang } = useI18n();
  const isEn = lang === "en";

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-brand-light p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10 text-amber-300">
          <AlertCircle className="h-9 w-9" />
        </div>

        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-white">
          {isEn ? "Payment Cancelled" : "Paiement non finalisé"}
        </h1>

        <p className="mt-3 text-base leading-relaxed text-slate-300">
          {isEn
            ? "Your checkout was cancelled. No charges were made. You can try again at any time."
            : "La procédure de paiement a été interrompue. Aucun montant n'a été débité. Vous pouvez réessayer quand vous le souhaitez."}
        </p>

        <div className="mt-8 flex justify-center">
          <Link
            href={customerAppPath("/settings/billing")}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-[#1d4ed8]"
          >
            <ArrowLeft className="h-4 w-4" />
            {isEn ? "Back to Billing Settings" : "Retour à la facturation"}
          </Link>
        </div>
      </div>
    </div>
  );
}
