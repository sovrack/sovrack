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
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg border border-accent/50 bg-accent/10 text-accent">
          <CheckCircle2 className="h-9 w-9" />
        </div>

        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-primary">
          {isEn ? "Payment Confirmed!" : "Paiement Confirmé !"}
        </h1>

        <p className="mt-3 text-base leading-relaxed text-secondary">
          {isEn
            ? "Your subscription has been activated successfully. Your fleet and project limits have been upgraded immediately."
            : "Votre abonnement a été activé avec succès. Les quotas de vos serveurs et projets ont été immédiatement mis à niveau."}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href={customerAppPath("/dashboard")}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground   transition hover:bg-accent-hover"
          >
            {isEn ? "Go to Dashboard" : "Aller au Tableau de bord"}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={customerAppPath("/settings/billing")}
            className="inline-flex items-center justify-center rounded-lg border border-border bg-hover/10 px-6 py-3.5 text-sm font-semibold text-primary transition hover:bg-hover/15"
          >
            {isEn ? "View Invoices" : "Voir mes factures"}
          </Link>
        </div>
      </div>
    </div>
  );
}
