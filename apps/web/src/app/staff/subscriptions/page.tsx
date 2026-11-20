"use client";

import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { staffService } from "@/features/staff/api/staff.service";

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-green-500/15 text-green-400",
  TRIALING: "bg-accent/15 text-accent",
  CANCELED: "bg-red-500/15 text-red-400",
  PAST_DUE: "bg-yellow-500/15 text-yellow-400",
  FREE: "bg-hover/15 text-secondary",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "Actif",
  TRIALING: "Essai",
  CANCELED: "Annulé",
  PAST_DUE: "Impayé",
  FREE: "Gratuit",
};

export default function StaffSubscriptionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["staff-subscriptions"],
    queryFn: () => staffService.getSubscriptions(),
    enabled: typeof window !== "undefined",
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-hover/15 text-primary">
          <CreditCard size={18} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-primary">Abonnements</h1>
          <p className="text-sm text-secondary">
            Tous les abonnements de chaque équipe cliente.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-hover/10 text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Équipe</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Fin de période</th>
              <th className="px-4 py-3 font-medium">Créé le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data ?? []).map((s) => (
              <tr key={s.id} className="hover:bg-hover/10">
                <td className="px-4 py-3 font-medium text-primary">
                  {s.team.name}
                </td>
                <td className="px-4 py-3 text-secondary">{s.plan}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                      statusStyles[s.status] ?? "bg-hover/15 text-secondary"
                    }`}
                  >
                    {statusLabels[s.status] ?? s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-secondary">
                  {s.currentPeriodEnd
                    ? new Date(s.currentPeriodEnd).toLocaleDateString("fr-FR")
                    : s.trialEndsAt
                      ? `Essai jusqu'au ${new Date(s.trialEndsAt).toLocaleDateString("fr-FR")}`
                      : "—"}
                </td>
                <td className="px-4 py-3 text-muted">
                  {new Date(s.createdAt).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            ))}
            {!isLoading && (data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Aucun abonnement.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
