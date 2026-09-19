"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Ban,
  Loader2,
  Lock,
  Search,
  UserCheck,
  Users,
  ShieldAlert,
} from "lucide-react";
import { staffService } from "@/features/staff/api/staff.service";
import { getApiErrorMessage } from "@/shared/lib/api";

const PAGE_SIZE = 50;

export default function StaffUsersPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<
    "" | "active" | "disabled" | "deletion-scheduled"
  >("");
  const [impersonationTarget, setImpersonationTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [impersonationReason, setImpersonationReason] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["staff-users", page, search, status],
    queryFn: () =>
      staffService.getUsers(page, PAGE_SIZE, {
        search: search || undefined,
        status: status || undefined,
      }),
    enabled: typeof window !== "undefined",
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["staff-users"] });
    void queryClient.invalidateQueries({ queryKey: ["staff-overview"] });
  };

  const blockMutation = useMutation({
    mutationFn: (id: string) =>
      staffService.updateUser(id, { isActive: false }),
    onSuccess: invalidate,
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => staffService.updateUser(id, { isActive: true }),
    onSuccess: invalidate,
  });

  const impersonateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      staffService.impersonateUser(id, reason),
    onSuccess: ({ redirectUrl }) => {
      // L'autorisation est transportée dans le fragment (jamais envoyé dans le
      // Referer) puis échangée une seule fois sur le domaine client.
      window.location.assign(redirectUrl);
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
          <Users size={18} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white">Utilisateurs</h1>
          <p className="text-sm text-zinc-400">
            Identités clientes pouvant accéder au produit ({data?.total ?? "…"}
            ).
          </p>
        </div>
      </div>

      <form
        className="mb-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(searchInput.trim());
        }}
      >
        <label className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-3 text-zinc-500"
          />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Rechercher par nom ou email"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-sky-500"
          />
        </label>
        <select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value as typeof status);
          }}
          className="rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-200"
        >
          <option value="">Tous les états</option>
          <option value="active">Actifs</option>
          <option value="disabled">Désactivés</option>
          <option value="deletion-scheduled">Suppression programmée</option>
        </select>
        <button
          type="submit"
          className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950"
        >
          Rechercher
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Espaces actifs</th>
              <th className="px-4 py-3 font-medium">État</th>
              <th className="px-4 py-3 font-medium">Créé le</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(data?.items ?? []).map((u) => (
              <tr key={u.id} className="hover:bg-white/5">
                <td className="px-4 py-3 font-medium text-white">
                  <Link
                    href={`/staff/users/${u.id}`}
                    className="hover:text-sky-300"
                  >
                    {u.fullName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-zinc-400">{u.email}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {u.teams.length === 0
                    ? "Aucun"
                    : u.teams
                        .map(
                          ({ team, role }) =>
                            `${team.name} · ${team.type === "PERSONAL" ? "Personnel" : role}`,
                        )
                        .join(", ")}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.isActive
                        ? "bg-green-500/15 text-green-400"
                        : "bg-red-500/15 text-red-400"
                    }`}
                  >
                    {u.deletionScheduledFor
                      ? "Suppression programmée"
                      : u.isActive
                        ? "Actif"
                        : "Désactivé"}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {new Date(u.createdAt).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {u.isActive ? (
                      <button
                        onClick={() => blockMutation.mutate(u.id)}
                        disabled={blockMutation.isPending}
                        title="Désactiver (bloquer)"
                        className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-amber-300 disabled:opacity-40"
                      >
                        <Ban size={16} />
                      </button>
                    ) : (
                      <button
                        onClick={() => activateMutation.mutate(u.id)}
                        disabled={activateMutation.isPending}
                        title="Réactiver"
                        className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-green-300 disabled:opacity-40"
                      >
                        <UserCheck size={16} />
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setImpersonationReason("");
                        impersonateMutation.reset();
                        setImpersonationTarget({ id: u.id, name: u.fullName });
                      }}
                      disabled={!u.isActive || impersonateMutation.isPending}
                      title="Se connecter en tant que ce client"
                      className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-blue-300 disabled:opacity-40"
                    >
                      <Lock size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && (data?.items ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Aucun utilisateur.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isLoading && (
        <div className="mt-4 flex items-center justify-center gap-2 py-4 text-sm text-zinc-400">
          <Loader2 size={16} className="animate-spin" />
          Chargement…
        </div>
      )}

      {isError && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          Impossible de charger les utilisateurs.
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

      {impersonationTarget && (
        <div
          role="presentation"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setImpersonationTarget(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="impersonation-title"
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-amber-500/10 p-2 text-amber-300">
                <ShieldAlert size={20} aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="impersonation-title"
                  className="text-lg font-semibold text-white"
                >
                  Ouvrir une session d’assistance
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Vous allez agir au nom de {impersonationTarget.name} pendant
                  15 minutes. L’ouverture et son motif seront journalisés.
                </p>
              </div>
            </div>

            <label className="mt-5 block text-sm font-medium text-zinc-200">
              Motif opérationnel
              <textarea
                autoFocus
                value={impersonationReason}
                onChange={(event) =>
                  setImpersonationReason(event.target.value.slice(0, 500))
                }
                minLength={10}
                maxLength={500}
                rows={4}
                placeholder="Ex. Diagnostic de l’incident INC-142 demandé par le client. Ne saisissez aucun secret."
                className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-sky-500"
              />
            </label>
            <div className="mt-1 text-right text-xs text-zinc-500">
              {impersonationReason.trim().length}/500
            </div>

            {impersonateMutation.isError && (
              <p role="alert" className="mt-3 text-sm text-red-400">
                {getApiErrorMessage(impersonateMutation.error)}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImpersonationTarget(null)}
                disabled={impersonateMutation.isPending}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() =>
                  impersonateMutation.mutate({
                    id: impersonationTarget.id,
                    reason: impersonationReason.trim(),
                  })
                }
                disabled={
                  impersonationReason.trim().length < 10 ||
                  impersonateMutation.isPending
                }
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {impersonateMutation.isPending && (
                  <Loader2 size={15} className="animate-spin" />
                )}
                Confirmer et ouvrir
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
