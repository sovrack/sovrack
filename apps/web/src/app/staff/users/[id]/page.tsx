"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, KeyRound, Loader2, RotateCcw } from "lucide-react";
import { staffService } from "@/features/staff/api/staff.service";
import { useStaffAuth } from "@/features/staff/api/use-staff-auth";
import { getApiErrorMessage } from "@/shared/lib/api";

export default function StaffUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { staff } = useStaffAuth();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [showDeletion, setShowDeletion] = useState(false);
  const query = useQuery({
    queryKey: ["staff-user", id],
    queryFn: () => staffService.getUser(id),
    enabled: Boolean(id),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["staff-user", id] });
    await queryClient.invalidateQueries({ queryKey: ["staff-users"] });
    await queryClient.invalidateQueries({ queryKey: ["staff-overview"] });
  };
  const activeMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      staffService.updateUser(id, { isActive }),
    onSuccess: refresh,
  });
  const sessionsMutation = useMutation({
    mutationFn: () => staffService.revokeUserSessions(id),
  });
  const deletionMutation = useMutation({
    mutationFn: () => staffService.scheduleUserDeletion(id, reason.trim()),
    onSuccess: async () => {
      setShowDeletion(false);
      setReason("");
      await refresh();
    },
  });
  const cancelDeletionMutation = useMutation({
    mutationFn: () => staffService.cancelUserDeletion(id),
    onSuccess: refresh,
  });

  if (query.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-zinc-400" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-red-300">
        {getApiErrorMessage(query.error)}
      </div>
    );
  }

  const user = query.data;
  const actionError =
    activeMutation.error ??
    sessionsMutation.error ??
    deletionMutation.error ??
    cancelDeletionMutation.error;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/staff/users"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft size={15} /> Utilisateurs
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{user.fullName}</h1>
            <p className="text-sm text-zinc-400">{user.email}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              user.deletionScheduledFor
                ? "bg-red-500/15 text-red-300"
                : user.isActive
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-amber-500/15 text-amber-300"
            }`}
          >
            {user.deletionScheduledFor
              ? "Suppression programmée"
              : user.isActive
                ? "Actif"
                : "Désactivé"}
          </span>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Authentification", user.provider],
          ["Email vérifié", user.emailVerifiedAt ? "Oui" : "Non"],
          ["Workspaces", String(user.teams.length)],
          ["Déploiements", String(user._count.deployments)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              {label}
            </p>
            <p className="mt-2 font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 p-5">
        <h2 className="font-semibold text-white">Workspaces et droits</h2>
        <div className="mt-4 space-y-2">
          {user.teams.map((membership) => (
            <Link
              key={membership.team.id}
              href={`/staff/teams/${membership.team.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3 hover:bg-white/10"
            >
              <span>
                <span className="font-medium text-white">
                  {membership.team.name}
                </span>
                <span className="ml-2 text-xs text-zinc-500">
                  {membership.team.type === "PERSONAL"
                    ? "Personnel"
                    : "Organisation"}
                </span>
              </span>
              <span className="text-xs text-zinc-300">
                {membership.role} · {membership.status}
                {membership.canManageBilling ? " · Facturation" : ""}
              </span>
            </Link>
          ))}
          {user.teams.length === 0 && (
            <p className="text-sm text-zinc-500">Aucun workspace.</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 p-5">
        <h2 className="font-semibold text-white">Actions de sécurité</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Chaque action est journalisée. La suppression directe n&apos;est pas
          disponible depuis le back-office.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => activeMutation.mutate(!user.isActive)}
            disabled={
              activeMutation.isPending || Boolean(user.deletionScheduledFor)
            }
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-40"
          >
            {user.isActive ? <Ban size={15} /> : <RotateCcw size={15} />}
            {user.isActive ? "Désactiver" : "Réactiver"}
          </button>
          <button
            type="button"
            onClick={() => sessionsMutation.mutate()}
            disabled={sessionsMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-40"
          >
            <KeyRound size={15} /> Révoquer toutes les sessions
          </button>
          {staff?.role === "ROOT" && user.deletionScheduledFor ? (
            <button
              type="button"
              onClick={() => cancelDeletionMutation.mutate()}
              disabled={cancelDeletionMutation.isPending}
              className="rounded-xl border border-emerald-500/30 px-4 py-2 text-sm text-emerald-300"
            >
              Annuler la suppression
            </button>
          ) : staff?.role === "ROOT" ? (
            <button
              type="button"
              onClick={() => setShowDeletion(true)}
              className="rounded-xl border border-red-500/30 px-4 py-2 text-sm text-red-300"
            >
              Programmer la suppression
            </button>
          ) : null}
        </div>
        {sessionsMutation.isSuccess && (
          <p className="mt-3 text-sm text-emerald-300">
            Toutes les sessions ont été révoquées.
          </p>
        )}
        {actionError && (
          <p className="mt-3 text-sm text-red-300">
            {getApiErrorMessage(actionError)}
          </p>
        )}
        {user.deletionScheduledFor && (
          <p className="mt-3 text-sm text-red-300">
            Purge prévue le{" "}
            {new Date(user.deletionScheduledFor).toLocaleString("fr-FR")}.
          </p>
        )}
      </section>

      {showDeletion && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-6">
            <h2 className="text-lg font-semibold text-white">
              Programmer la suppression
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              L&apos;accès sera coupé immédiatement. La purge aura lieu après 30
              jours. Les organisations sont conservées ; un espace personnel
              sera supprimé avec l&apos;identité.
            </p>
            <textarea
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, 500))}
              rows={4}
              placeholder="Motif opérationnel obligatoire (10 caractères minimum)"
              className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none focus:border-red-400"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeletion(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => deletionMutation.mutate()}
                disabled={
                  reason.trim().length < 10 || deletionMutation.isPending
                }
                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Confirmer
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
