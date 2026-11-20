"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { staffService } from "@/features/staff/api/staff.service";

const PAGE_SIZE = 50;

export default function StaffTeamsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["staff-teams", page],
    queryFn: () => staffService.getTeams(page, PAGE_SIZE),
    enabled: typeof window !== "undefined",
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-hover/15 text-primary">
          <Rocket size={18} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-primary">Espaces</h1>
          <p className="text-sm text-secondary">
            Espaces personnels et organisations de la plateforme (
            {data?.total ?? "…"}).
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-hover/10 text-secondary">
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
              <tr key={t.id} className="hover:bg-hover/10">
                <td className="px-4 py-3 font-medium text-primary">
                  <Link
                    href={`/staff/teams/${t.id}`}
                    className="hover:text-accent"
                  >
                    {t.name}
                  </Link>
                  <p className="text-xs font-normal text-muted">{t.slug}</p>
                </td>
                <td className="px-4 py-3 text-secondary">
                  {t.type === "PERSONAL" ? "Personnel" : "Organisation"}
                </td>
                <td className="px-4 py-3 text-secondary">{t.status}</td>
                <td className="px-4 py-3 text-secondary">{t._count.members}</td>
                <td className="px-4 py-3 text-secondary">{t._count.projects}</td>
                <td className="px-4 py-3 text-secondary">{t._count.servers}</td>
                <td className="px-4 py-3 text-muted">
                  {new Date(t.createdAt).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            ))}
            {!isLoading && (data?.items ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  Aucun espace.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isLoading && (
        <p className="mt-4 text-center text-sm text-muted">Chargement…</p>
      )}
      {isError && (
        <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          Impossible de charger les workspaces.
          <button
            type="button"
            onClick={() => void refetch()}
            className="ml-3 font-semibold underline"
          >
            Réessayer
          </button>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-secondary">
          <span>
            Page {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-border px-3 py-1.5 hover:bg-hover/10 disabled:opacity-40"
            >
              Précédent
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-border px-3 py-1.5 hover:bg-hover/10 disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
