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
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";

const PLAN_META: Record<
  Plan,
  { name: string; description: string; highlight: boolean }
> = {
  FREE: {
    name: "Free",
    description: "Gratuit · 1 projet · 1 serveur",
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
  if (!isCapabilityEnabled("selfServiceBilling")) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Facturation"
          description="L’accès actuel est gratuit et ne nécessite aucun moyen de paiement"
        />
        <Alert tone="info" title="Accès gratuit actif">
          Vous pouvez utiliser les capacités disponibles de Sovrack dans les
          limites annoncées sur la page Tarification. Aucun abonnement payant
          n&apos;est proposé et aucune carte bancaire n&apos;est demandée.
        </Alert>
      </div>
    );
  }

  return <BillingWorkspace />;
}

function BillingWorkspace() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const { data, isLoading, isError } = useQuery({
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
        <Loader2 className="h-8 w-8 animate-spin text-muted" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Facturation"
          description="Abonnement et statut de votre espace Sovrack"
        />
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Sparkles size={20} />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-primary">
                Instance Autohébergée / Communautaire Active
              </h3>
              <p className="text-sm text-secondary leading-relaxed">
                Le module de facturation cloud (Stripe/SaaS) est désactivé sur cette instance. Vous disposez d&apos;un accès complet et souverain pour connecter vos serveurs, déployer vos dépôts Git et orchestrer vos conteneurs Docker sans abonnement commercial imposé.
              </p>
              <div className="pt-2 flex items-center gap-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["billing"] })}
                >
                  Rafraîchir l&apos;état
                </Button>
              </div>
            </div>
          </div>
        </div>
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
          <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium">
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
          Essai gratuit jusqu&apos;au {formatDate(trialEnd)}. Choisissez un plan
          avant la fin de l&apos;essai pour ne pas être limité.
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
                    ? "border-accent bg-accent/5"
                    : "border-border bg-card"
                }`}
              >
                {meta.highlight && (
                  <span className="absolute -top-2.5 right-3 inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
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
                <p className="mt-1 text-xs text-secondary">
                  {meta.description}
                </p>
                <p className="mt-3 text-2xl font-bold tracking-tight">
                  {formatMillimes(price)}
                  <span className="text-xs font-normal text-muted">
                    /mois
                  </span>
                </p>
                {limitsForPlan && (
                  <p className="mt-2 text-xs text-muted">
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
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
          <Lock size={12} /> Paiement sécurisé · Sans engagement · Résiliation à
          tout moment depuis cette page
        </p>
        {subscription.status === "CANCELED" ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-red-400">
                Abonnement annulé
              </p>
              <p className="text-xs text-secondary">
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
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Annuler l&apos;abonnement</p>
              <p className="text-xs text-secondary">
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
            <FileText className="h-8 w-8 text-muted" />
            <p className="text-sm text-secondary">
              Aucune facture pour le moment. Votre première facture apparaîtra
              après la souscription à un plan payant.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
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
                  <p className="text-xs text-muted">
                    Période de facturation
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">
                    {formatMillimes(invoice.amountMillimes)}
                  </span>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
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
