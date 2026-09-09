"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Rocket } from "lucide-react";
import { staffService } from "@/features/staff/api/staff.service";

const PAGE_SIZE = 50;

export default function StaffTeamsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["staff-teams", page],
    queryFn: () => staffService.getTeams(page, PAGE_SIZE),
    enabled: typeof window !== "undefined",
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
          <Rocket size={18} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white">Espaces</h1>
          <p className="text-sm text-zinc-400">
            Espaces personnels et organisations de la plateforme (
            {data?.total ?? "…"}).
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">État</th>
              <th className="px-4 py-3 font-medium">Membres</th>
              <th className="px-4 py-3 font-medium">Projets</th>
              <th className="px-4 py-3 font-medium">Serveurs</th>
              <th className="px-4 py-3 font-medium">Créée le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(data?.items ?? []).map((t) => (
              <tr key={t.id} className="hover:bg-white/5">
                <td className="px-4 py-3 font-medium text-white">{t.name}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {t.type === "PERSONAL" ? "Personnel" : "Organisation"}
                </td>
                <td className="px-4 py-3 text-zinc-400">{t.status}</td>
                <td className="px-4 py-3 text-zinc-400">{t._count.members}</td>
                <td className="px-4 py-3 text-zinc-400">{t._count.projects}</td>
                <td className="px-4 py-3 text-zinc-400">{t._count.servers}</td>
                <td className="px-4 py-3 text-zinc-500">
                  {new Date(t.createdAt).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            ))}
            {!isLoading && (data?.items ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  Aucun espace.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-400">
          <span>
            Page {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5 disabled:opacity-40"
            >
              Précédent
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5 disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
