"use client";

import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { staffService } from "@/features/staff/api/staff.service";

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-green-500/15 text-green-400",
  TRIALING: "bg-blue-500/15 text-blue-400",
  CANCELED: "bg-red-500/15 text-red-400",
  PAST_DUE: "bg-yellow-500/15 text-yellow-400",
  FREE: "bg-white/10 text-zinc-300",
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
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
          <CreditCard size={18} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white">Abonnements</h1>
          <p className="text-sm text-zinc-400">
            Tous les abonnements de chaque équipe cliente.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Équipe</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Fin de période</th>
              <th className="px-4 py-3 font-medium">Créé le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(data ?? []).map((s) => (
              <tr key={s.id} className="hover:bg-white/5">
                <td className="px-4 py-3 font-medium text-white">{s.team.name}</td>
                <td className="px-4 py-3 text-zinc-300">{s.plan}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      statusStyles[s.status] ?? "bg-white/10 text-zinc-300"
                    }`}
                  >
                    {statusLabels[s.status] ?? s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {s.currentPeriodEnd
                    ? new Date(s.currentPeriodEnd).toLocaleDateString("fr-FR")
                    : s.trialEndsAt
                      ? `Essai jusqu'au ${new Date(s.trialEndsAt).toLocaleDateString("fr-FR")}`
                      : "—"}
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {new Date(s.createdAt).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            ))}
            {!isLoading && (data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
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