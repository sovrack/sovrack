"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CreditCard, Rocket, Users } from "lucide-react";
import { staffService } from "@/features/staff/api/staff.service";

export default function StaffDashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["staff-overview"],
    queryFn: () => staffService.getOverview(),
    enabled: typeof window !== "undefined",
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-300">
        Impossible de charger la vue d&apos;ensemble. Vérifiez votre session ou
        réessayez.
        <button
          type="button"
          onClick={() => void refetch()}
          className="ml-3 rounded-lg border border-red-400/30 px-3 py-1.5 font-semibold"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const cards = [
    {
      label: "Comptes clients",
      value: data.users.total,
      sub: `${data.users.active} actifs · ${data.users.disabled} désactivés · ${data.users.deletionScheduled} suppressions programmées`,
      icon: Users,
    },
    {
      label: "Workspaces",
      value: data.teams.total,
      sub: `${data.teams.personal} personnels · ${data.teams.organizations} organisations`,
      icon: Rocket,
    },
    {
      label: "Abonnements",
      value: data.subscriptions.total,
      sub: `${data.subscriptions.active} actifs · ${data.subscriptions.trialing} essais`,
      icon: CreditCard,
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary">Vue d&apos;ensemble</h1>
        <p className="mt-1 text-sm text-secondary">
          Supervision globale de la plateforme : comptes clients et abonnements.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-border bg-hover/10 p-5"
          >
            <div className="flex items-center gap-2 text-secondary">
              <c.icon size={16} />
              <p className="text-sm font-medium">{c.label}</p>
            </div>
            <p className="mt-3 text-3xl font-bold text-primary">{c.value}</p>
            <p className="mt-1 text-xs text-muted">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary">
            Derniers comptes créés
          </h2>
          <Link
            href="/staff/users"
            className="text-sm font-medium text-accent hover:text-accent"
          >
            Voir tous les utilisateurs
          </Link>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-hover/10 text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Workspaces actifs</th>
                <th className="px-4 py-3 font-medium">État</th>
                <th className="px-4 py-3 font-medium">Créé le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.recentUsers.map((u) => (
                <tr key={u.id} className="hover:bg-hover/10">
                  <td className="px-4 py-3 text-primary">{u.fullName}</td>
                  <td className="px-4 py-3 text-secondary">{u.email}</td>
                  <td className="px-4 py-3 text-secondary">{u._count.teams}</td>
                  <td className="px-4 py-3 text-secondary">
                    {u.deletionScheduledFor
                      ? "Suppression programmée"
                      : u.isActive
                        ? "Actif"
                        : "Désactivé"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(u.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))}
              {data.recentUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-muted"
                  >
                    Aucun compte pour l&apos;instant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
