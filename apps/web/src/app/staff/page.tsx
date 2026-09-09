"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CreditCard, Rocket, Users } from "lucide-react";
import { staffService } from "@/features/staff/api/staff.service";

export default function StaffDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["staff-overview"],
    queryFn: () => staffService.getOverview(),
    enabled: typeof window !== "undefined",
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  const cards = [
    {
      label: "Comptes clients",
      value: data.users.total,
      sub: `${data.users.active} actifs · ${data.users.owners} owners · ${data.users.members} membres`,
      icon: Users,
    },
    {
      label: "Équipes",
      value: data.teams.total,
      sub: "sur toute la plateforme",
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
        <h1 className="text-2xl font-bold text-white">Vue d&apos;ensemble</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Supervision globale de la plateforme : comptes clients et abonnements.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-white/10 bg-white/5 p-5"
          >
            <div className="flex items-center gap-2 text-zinc-400">
              <c.icon size={16} />
              <p className="text-sm font-medium">{c.label}</p>
            </div>
            <p className="mt-3 text-3xl font-bold text-white">{c.value}</p>
            <p className="mt-1 text-xs text-zinc-500">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Derniers comptes créés
          </h2>
          <Link
            href="/staff/users"
            className="text-sm font-medium text-blue-400 hover:text-blue-300"
          >
            Voir tous les utilisateurs
          </Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/5 text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Rôle</th>
                <th className="px-4 py-3 font-medium">Créé le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.recentUsers.map((u) => (
                <tr key={u.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 text-white">{u.fullName}</td>
                  <td className="px-4 py-3 text-zinc-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white">
                      {u.role === "OWNER" ? "Propriétaire" : "Membre"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {new Date(u.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))}
              {data.recentUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-zinc-500"
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
