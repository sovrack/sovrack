"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailCheck, ShieldCheck, UserPlus } from "lucide-react";
import { staffService } from "@/features/staff/api/staff.service";
import { useStaffAuth } from "@/features/staff/api/use-staff-auth";
import type { PlatformRole, StaffStatus } from "@/features/staff/types/staff";

const PAGE_SIZE = 50;

const ROLE_LABELS: Record<PlatformRole, string> = {
  ROOT: "Root",
  ADMIN: "Admin",
  OPERATOR: "Opérateur",
};

const ASSIGNABLE_ROLES = ["ADMIN", "OPERATOR"] as const;

const STATUS_LABELS: Record<StaffStatus, string> = {
  INVITED: "Invitation en attente",
  ACTIVE: "Actif",
  DISABLED: "Désactivé",
  BLOCKED: "Bloqué",
};

export default function StaffAccountsPage() {
  const { staff } = useStaffAuth();
  const canManage = staff?.role === "ROOT";
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    email: "",
    fullName: "",
    role: "OPERATOR" as (typeof ASSIGNABLE_ROLES)[number],
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
        fullName: "",
        role: "OPERATOR",
      });
      setFormError("");
      invalidate();
    },
    onError: (err: unknown) => {
      // L'invitation est persistée avant l'appel au fournisseur SMTP. Si le
      // transport échoue, le compte reste visible et peut être renvoyé.
      invalidate();
      setFormError(
        err instanceof Error
          ? `${err.message} Actualisez la liste puis utilisez « Renvoyer l’invitation ».`
          : "L’invitation n’a pas été livrée. Actualisez puis renvoyez-la.",
      );
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: StaffStatus }) =>
      staffService.updateStaff(id, { status }),
    onSuccess: invalidate,
  });

  const roleMutation = useMutation({
    mutationFn: ({
      id,
      role,
    }: {
      id: string;
      role: Exclude<PlatformRole, "ROOT">;
    }) => staffService.updateStaff(id, { role }),
    onSuccess: invalidate,
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) => staffService.resendStaffInvitation(id),
    onSuccess: invalidate,
    onError: (err: unknown) => {
      setFormError(
        err instanceof Error ? err.message : "Échec du renvoi de l’invitation",
      );
    },
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
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-hover/15 text-primary">
            <ShieldCheck size={18} />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-primary">
              Comptes back-office
            </h1>
            <p className="text-sm text-secondary">
              Membres de l&apos;équipe d&apos;administration (
              {data?.total ?? "…"}).
            </p>
          </div>
        </div>
        {canManage ? (
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover"
          >
            <UserPlus size={16} />
            Créer un compte
          </button>
        ) : null}
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-6 grid gap-4 rounded-lg border border-border bg-hover/10 p-5 md:grid-cols-4"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">
              Email
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">
              Nom complet
            </label>
            <input
              type="text"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-secondary">
              Rôle
            </label>
            <select
              value={form.role}
              onChange={(e) =>
                setForm({
                  ...form,
                  role: e.target.value as (typeof ASSIGNABLE_ROLES)[number],
                })
              }
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
            >
              {ASSIGNABLE_ROLES.map((r) => (
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
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover disabled:opacity-50"
            >
              <UserPlus size={16} />
              {createMutation.isPending ? "Envoi…" : "Inviter"}
            </button>
          </div>
          {formError && (
            <p className="col-span-full text-sm text-red-400">{formError}</p>
          )}
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-hover/10 text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rôle</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Dernière connexion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data?.items ?? []).map((s) => (
              <tr key={s.id} className="hover:bg-hover/10">
                <td className="px-4 py-3 font-medium text-primary">
                  {s.fullName}
                </td>
                <td className="px-4 py-3 text-secondary">{s.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={s.role}
                    onChange={(e) =>
                      roleMutation.mutate({
                        id: s.id,
                        role: e.target.value as Exclude<PlatformRole, "ROOT">,
                      })
                    }
                    disabled={!canManage || roleMutation.isPending}
                    className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-medium text-primary focus:border-accent focus:outline-none"
                  >
                    {(s.role === "ROOT"
                      ? (["ROOT"] as const)
                      : ASSIGNABLE_ROLES
                    ).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {s.status === "INVITED" ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                        {STATUS_LABELS.INVITED}
                      </span>
                      {canManage ? (
                        <button
                          type="button"
                          title="Renvoyer l’invitation"
                          disabled={resendMutation.isPending}
                          onClick={() => resendMutation.mutate(s.id)}
                          className="rounded-lg p-1.5 text-secondary hover:bg-hover/15 hover:text-primary disabled:opacity-40"
                        >
                          <MailCheck size={15} />
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <select
                      value={s.status}
                      onChange={(e) =>
                        statusMutation.mutate({
                          id: s.id,
                          status: e.target.value as StaffStatus,
                        })
                      }
                      disabled={!canManage || statusMutation.isPending}
                      className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-medium text-primary focus:border-accent focus:outline-none"
                    >
                      {(["ACTIVE", "DISABLED", "BLOCKED"] as StaffStatus[]).map(
                        (status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </option>
                        ),
                      )}
                    </select>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  {s.lastLoginAt
                    ? new Date(s.lastLoginAt).toLocaleString("fr-FR")
                    : "Jamais"}
                </td>
              </tr>
            ))}
            {!isLoading && (data?.items ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Aucun compte back-office.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isLoading && (
        <div className="mt-4 flex items-center justify-center gap-2 py-4 text-sm text-secondary">
          Chargement…
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
