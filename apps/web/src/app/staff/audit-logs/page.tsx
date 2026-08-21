"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { staffService } from "@/features/staff/api/staff.service";

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  "staff.login": "Connexion back-office",
  "staff.logout": "Déconnexion back-office",
  "staff.create": "Création compte back-office",
  "staff.update": "Modification compte back-office",
  "user.block": "Blocage client",
  "user.unblock": "Déblocage client",
  "user.role.change": "Changement rôle client",
  "user.delete": "Suppression client",
  "user.impersonate": "Impression (session client)",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export default function StaffAuditLogsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["staff-audit-logs", page],
    queryFn: () => staffService.getAuditLogs(page, PAGE_SIZE),
    enabled: typeof window !== "undefined",
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
          <ClipboardList size={18} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white">
            Journal d&apos;audit
          </h1>
          <p className="text-sm text-zinc-400">
            Toutes les actions du back-office, enregistrées de manière
            append-only ({data?.total ?? "…"}).
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Acteur</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">IP</th>
              <th className="px-4 py-3 font-medium">Le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(data?.items ?? []).map((entry) => (
              <tr key={entry.id} className="hover:bg-white/5">
                <td className="px-4 py-3 font-medium text-white">
                  {actionLabel(entry.action)}
                </td>
                <td className="px-4 py-3 text-zinc-300">
                  {entry.staff?.email ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-zinc-200">
                    {entry.resource}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-500">{entry.ip ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-500">
                  {new Date(entry.createdAt).toLocaleString("fr-FR")}
                </td>
              </tr>
            ))}
            {!isLoading && (data?.items ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  Aucune entrée de journal.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isLoading && (
        <div className="mt-4 flex items-center justify-center gap-2 py-4 text-sm text-zinc-400">
          Chargement…
        </div>
      )}

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
