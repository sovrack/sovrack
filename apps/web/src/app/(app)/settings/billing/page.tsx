"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Check,
  CreditCard,
  FileText,
  Loader2,
  Lock,
  Sparkles,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/shared/layout/page-header";
import { SectionCard } from "@/shared/layout/section-card";
import { Alert } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { billingService } from "@/features/billing/api/billing.service";
import type { BillingInfo, Plan } from "@/features/billing/types/billing";
import { getApiErrorMessage } from "@/shared/lib/api";

const PLAN_META: Record<
  Plan,
  { name: string; description: string; highlight: boolean }
> = {
  FREE: {
    name: "Free",
    description: "Essai 14 jours · 1 projet · 1 serveur",
    highlight: false,
  },
  STARTER: {
    name: "Starter",
    description: "3 projets · 2 serveurs · 10 membres",
    highlight: false,
  },
  PRO: {
    name: "Pro",
    description: "10 projets · 5 serveurs · 25 membres",
    highlight: true,
  },
  ENTERPRISE: {
    name: "Enterprise",
    description: "100 projets · 100 serveurs · 500 membres",
    highlight: false,
  },
};

function formatMillimes(millimes: number): string {
  if (millimes === 0) return "0 DT";
  const tnd = (millimes / 1000).toFixed(3).replace(/\.?0+$/, "");
  return `${tnd} DT`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-TN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<
    { tone: "success" | "error"; message: string } | null
  >(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["billing"],
    queryFn: billingService.getMyBilling,
  });

  const subscribe = useMutation({
    mutationFn: billingService.subscribe,
    onSuccess: (res) => {
      setNotice({ tone: "success", message: res.message });
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (err: unknown) => {
      setNotice({ tone: "error", message: getApiErrorMessage(err) });
    },
  });

  const cancel = useMutation({
    mutationFn: billingService.cancel,
    onSuccess: (res) => {
      setNotice({ tone: "success", message: res.message });
      void queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (err: unknown) => {
      setNotice({ tone: "error", message: getApiErrorMessage(err) });
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Alert tone="error">
          {getApiErrorMessage(error)} — impossible de charger la facturation.
        </Alert>
      </div>
    );
  }

  const { subscription, prices, limits, usage, invoices } = data as BillingInfo;

  const planOrder: Plan[] = ["FREE", "STARTER", "PRO", "ENTERPRISE"];
  const trialEnd = subscription.trialEndsAt;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Facturation"
        description="Gérez votre abonnement et vos factures Sovrack"
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-sm font-medium">
            <BadgeCheck className="h-4 w-4 text-emerald-500" />
            Plan {PLAN_META[subscription.plan].name}
          </span>
        }
      />

      {notice && (
        <Alert tone={notice.tone === "success" ? "success" : "error"}>
          {notice.message}
        </Alert>
      )}

      {subscription.status === "PAST_DUE" && (
        <Alert tone="error">
          Paiement en retard — votre abonnement va être suspendu. Régularisez
          votre facture pour éviter l&apos;arrêt de vos services.
        </Alert>
      )}

      {trialEnd && new Date(trialEnd) > new Date() && (
        <Alert tone="info">
          Essai gratuit jusqu&apos;au {formatDate(trialEnd)}. Choisissez un
          plan avant la fin de l&apos;essai pour ne pas être limité.
        </Alert>
      )}

      {/* Plans */}
      <SectionCard
        title="Choisissez votre plan"
        description="Prix TTC mensuels en dinars tunisiens · Infra gérée incluse"
      >
        <div className="grid gap-4 md:grid-cols-4">
          {planOrder.map((plan) => {
            const meta = PLAN_META[plan];
            const isCurrent = subscription.plan === plan;
            const price = prices[plan];
            const limitsForPlan =
              plan === subscription.plan ? limits : undefined;
            return (
              <div
                key={plan}
                className={`relative flex flex-col rounded-lg border p-5 transition-colors ${
                  meta.highlight
                    ? "border-indigo-400 bg-indigo-500/5 dark:border-indigo-500"
                    : "border-[var(--border)] bg-[var(--bg-card)]"
                }`}
              >
                {meta.highlight && (
                  <span className="absolute -top-2.5 right-3 inline-flex items-center gap-1 rounded-full bg-indigo-500 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    <Zap size={11} /> Populaire
                  </span>
                )}
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  {plan === "FREE" ? (
                    <Sparkles size={14} />
                  ) : (
                    <CreditCard size={14} />
                  )}
                  {meta.name}
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {meta.description}
                </p>
                <p className="mt-3 text-2xl font-bold tracking-tight">
                  {formatMillimes(price)}
                  <span className="text-xs font-normal text-[var(--text-muted)]">
                    /mois
                  </span>
                </p>
                {limitsForPlan && (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Usage : {usage.projects}/{limitsForPlan.maxProjects} projets
                    · {usage.servers}/{limitsForPlan.maxServers} serveurs ·{" "}
                    {usage.members}/{limitsForPlan.maxTeamMembers} membres
                  </p>
                )}
                <div className="mt-4 flex-1" />
                <Button
                  variant={isCurrent ? "secondary" : "primary"}
                  size="sm"
                  disabled={isCurrent || subscribe.isPending}
                  onClick={() => subscribe.mutate(plan)}
                  className="w-full"
                >
                  {isCurrent ? (
                    <>
                      <Check size={14} /> Plan actuel
                    </>
                  ) : subscribe.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : plan === "FREE" ? (
                    "Revenir au Free"
                  ) : (
                    `Passer au ${meta.name}`
                  )}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Lock size={12} /> Paiement sécurisé · Sans engagement · Résiliation à
          tout moment depuis cette page
        </p>
        {subscription.status === "CANCELED" ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-red-400">
                Abonnement annulé
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                {subscription.canceledAt
                  ? `Annulé le ${formatDate(subscription.canceledAt)}. Vos services restent accessibles jusqu'à la fin de la période en cours.`
                  : "Votre abonnement est annulé. Vous pouvez vous réabonner à tout moment."}
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => subscribe.mutate(subscription.plan)}
              disabled={subscribe.isPending}
            >
              {subscribe.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}{" "}
              Réabonner
            </Button>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Annuler l&apos;abonnement</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Votre abonnement passera au statut annulé. Vous pourrez vous
                réabonner à tout moment.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              {cancel.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Lock size={14} />
              )}{" "}
              Annuler
            </Button>
          </div>
        )}
      </SectionCard>

      {/* Factures */}
      <SectionCard
        title="Factures"
        description={`${invoices.length} facture${invoices.length > 1 ? "s" : ""}`}
      >
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <FileText className="h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-secondary)]">
              Aucune facture pour le moment. Votre première facture apparaîtra
              après la souscription à un plan payant.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {formatDate(invoice.periodStart)} —{" "}
                    {formatDate(invoice.periodEnd)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Période de facturation
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">
                    {formatMillimes(invoice.amountMillimes)}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                      invoice.status === "PAID"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                        : invoice.status === "PENDING"
                          ? "border-amber-500/20 bg-amber-500/10 text-amber-500"
                          : "border-red-500/20 bg-red-500/10 text-red-500"
                    }`}
                  >
                    {invoice.status === "PAID"
                      ? "Payée"
                      : invoice.status === "PENDING"
                        ? "En attente"
                        : invoice.status === "OVERDUE"
                          ? "En retard"
                          : "Annulée"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
