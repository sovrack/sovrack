"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { staffService } from "@/features/staff/api/staff.service";
import type { PlatformRole, StaffStatus } from "@/features/staff/types/staff";

const PAGE_SIZE = 50;

const ROLE_LABELS: Record<PlatformRole, string> = {
  ROOT: "Root",
  ADMIN: "Admin",
  OPERATOR: "Opérateur",
};

const STATUS_LABELS: Record<StaffStatus, string> = {
  ACTIVE: "Actif",
  DISABLED: "Désactivé",
  BLOCKED: "Bloqué",
};

export default function StaffAccountsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "OPERATOR" as PlatformRole,
  });
  const [formError, setFormError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["staff-accounts", page],
    queryFn: () => staffService.listStaff(page, PAGE_SIZE),
    enabled: typeof window !== "undefined",
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["staff-accounts"] });
  };

  const createMutation = useMutation({
    mutationFn: () => staffService.createStaff(form),
    onSuccess: () => {
      setShowCreate(false);
      setForm({
        email: "",
        password: "",
        fullName: "",
        role: "OPERATOR",
      });
      setFormError("");
      invalidate();
    },
    onError: (err: unknown) => {
      setFormError(
        err instanceof Error ? err.message : "Erreur lors de la création",
      );
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: StaffStatus }) =>
      staffService.updateStaff(id, { status }),
    onSuccess: invalidate,
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: PlatformRole }) =>
      staffService.updateStaff(id, { role }),
    onSuccess: invalidate,
  });

  const handleCreate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError("");
    createMutation.mutate();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
            <ShieldCheck size={18} />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Comptes back-office
            </h1>
            <p className="text-sm text-zinc-400">
              Membres de l&apos;équipe d&apos;administration (
              {data?.total ?? "…"}).
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
        >
          <UserPlus size={16} />
          Créer un compte
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 md:grid-cols-5"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Email
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Nom complet
            </label>
            <input
              type="text"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Mot de passe (8+ chars, lettre + chiffre)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Rôle
            </label>
            <select
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as PlatformRole })
              }
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
            >
              {(Object.keys(ROLE_LABELS) as PlatformRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              <KeyRound size={16} />
              {createMutation.isPending ? "Création…" : "Créer"}
            </button>
          </div>
          {formError && (
            <p className="col-span-full text-sm text-red-400">{formError}</p>
          )}
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/5 text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rôle</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Dernière connexion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(data?.items ?? []).map((s) => (
              <tr key={s.id} className="hover:bg-white/5">
                <td className="px-4 py-3 font-medium text-white">
                  {s.fullName}
                </td>
                <td className="px-4 py-3 text-zinc-400">{s.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={s.role}
                    onChange={(e) =>
                      roleMutation.mutate({
                        id: s.id,
                        role: e.target.value as PlatformRole,
                      })
                    }
                    disabled={roleMutation.isPending}
                    className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs font-medium text-white focus:border-blue-500 focus:outline-none"
                  >
                    {(Object.keys(ROLE_LABELS) as PlatformRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={s.status}
                    onChange={(e) =>
                      statusMutation.mutate({
                        id: s.id,
                        status: e.target.value as StaffStatus,
                      })
                    }
                    disabled={statusMutation.isPending}
                    className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs font-medium text-white focus:border-blue-500 focus:outline-none"
                  >
                    {(Object.keys(STATUS_LABELS) as StaffStatus[]).map((st) => (
                      <option key={st} value={st}>
                        {STATUS_LABELS[st]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {s.lastLoginAt
                    ? new Date(s.lastLoginAt).toLocaleString("fr-FR")
                    : "Jamais"}
                </td>
              </tr>
            ))}
            {!isLoading && (data?.items ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  Aucun compte back-office.
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
