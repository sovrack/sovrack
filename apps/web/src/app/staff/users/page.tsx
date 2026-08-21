"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  Loader2,
  Lock,
  Trash2,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { staffService } from "@/features/staff/api/staff.service";
import type { AuthUserView } from "@/features/staff/api/staff.service";
import { useStaffAuth } from "@/features/staff/api/use-staff-auth";

const PAGE_SIZE = 50;

const CLIENT_ROLES: AuthUserView["role"][] = ["OWNER", "MEMBER"];

function roleLabel(role: string): string {
  if (role === "SUPER_ADMIN") return "Super admin";
  if (role === "OWNER") return "Propriétaire";
  return "Membre";
}

export default function StaffUsersPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { staff } = useStaffAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["staff-users", page],
    queryFn: () => staffService.getUsers(page, PAGE_SIZE),
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

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      staffService.updateUser(id, { role: role as AuthUserView["role"] }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => staffService.deleteUser(id),
    onSuccess: invalidate,
  });

  const impersonateMutation = useMutation({
    mutationFn: (id: string) => staffService.impersonateUser(id),
    onSuccess: () => {
      // Le cookie client a été posé par le backend → on bascule vers le
      // dashboard du compte impersonné.
      window.location.assign("/dashboard");
    },
  });

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
          <Users size={18} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white">Utilisateurs</h1>
          <p className="text-sm text-zinc-400">
            Tous les comptes créés sur la plateforme ({data?.total ?? "…"}).
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rôle</th>
              <th className="px-4 py-3 font-medium">État</th>
              <th className="px-4 py-3 font-medium">Créé le</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(data?.items ?? []).map((u) => (
              <tr key={u.id} className="hover:bg-white/5">
                <td className="px-4 py-3 font-medium text-white">
                  {u.fullName}
                </td>
                <td className="px-4 py-3 text-zinc-400">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) =>
                      roleMutation.mutate({ id: u.id, role: e.target.value })
                    }
                    disabled={!u.isActive || roleMutation.isPending}
                    className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs font-medium text-white focus:border-blue-500 focus:outline-none disabled:opacity-40"
                  >
                    {u.role === "SUPER_ADMIN" ? (
                      <option value={u.role}>Super admin</option>
                    ) : (
                      CLIENT_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))
                    )}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.isActive
                        ? "bg-green-500/15 text-green-400"
                        : "bg-red-500/15 text-red-400"
                    }`}
                  >
                    {u.isActive ? "Actif" : "Désactivé"}
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
                      onClick={() => impersonateMutation.mutate(u.id)}
                      disabled={!u.isActive || impersonateMutation.isPending}
                      title="Se connecter en tant que ce client"
                      className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-blue-300 disabled:opacity-40"
                    >
                      <Lock size={16} />
                    </button>

                    {staff?.role === "ROOT" ? (
                      <>
                        {confirmDelete === u.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => deleteMutation.mutate(u.id)}
                              disabled={deleteMutation.isPending}
                              title="Confirmer la suppression"
                              className="rounded-lg p-1.5 text-red-400 transition hover:bg-white/10 hover:text-red-300"
                            >
                              <CheckCircle2 size={16} />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10"
                            >
                              <XCircle size={16} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(u.id)}
                            title="Supprimer définitivement (ROOT)"
                            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-red-300"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </>
                    ) : null}
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
