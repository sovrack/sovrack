"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  staffService,
  type WorkspaceStatus,
} from "@/features/staff/api/staff.service";
import { getApiErrorMessage } from "@/shared/lib/api";

export default function StaffTeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["staff-team", id],
    queryFn: () => staffService.getTeam(id),
    enabled: Boolean(id),
  });
  const statusMutation = useMutation({
    mutationFn: (status: WorkspaceStatus) =>
      staffService.updateTeamStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff-team", id] });
      await queryClient.invalidateQueries({ queryKey: ["staff-teams"] });
      await queryClient.invalidateQueries({ queryKey: ["staff-overview"] });
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-secondary" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-6 text-red-300">
        {getApiErrorMessage(query.error)}
      </div>
    );
  }
  const team = query.data;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/staff/teams"
          className="inline-flex items-center gap-2 text-sm text-secondary hover:text-primary"
        >
          <ArrowLeft size={15} /> Workspaces
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-primary">{team.name}</h1>
            <p className="text-sm text-muted">
              {team.slug} ·{" "}
              {team.type === "PERSONAL" ? "Personnel" : "Organisation"}
            </p>
          </div>
          <select
            aria-label="État du workspace"
            value={team.status}
            disabled={
              team.status === "DELETION_PENDING" || statusMutation.isPending
            }
            onChange={(event) =>
              statusMutation.mutate(event.target.value as WorkspaceStatus)
            }
            className="rounded-lg border border-border bg-app px-3 py-2 text-sm text-primary"
          >
            <option value="ACTIVE">Actif</option>
            <option value="SUSPENDED">Suspendu</option>
            <option value="ARCHIVED">Archivé</option>
            {team.status === "DELETION_PENDING" && (
              <option value="DELETION_PENDING">Suppression programmée</option>
            )}
          </select>
        </div>
        {statusMutation.isError && (
          <p className="mt-3 text-sm text-red-300">
            {getApiErrorMessage(statusMutation.error)}
          </p>
        )}
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Membres", team._count.members],
          ["Projets", team._count.projects],
          ["Serveurs", team._count.servers],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-hover/10 p-4"
          >
            <p className="text-xs uppercase tracking-wide text-muted">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold text-primary">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-border p-5">
        <h2 className="font-semibold text-primary">Membres</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="pb-3 font-medium">Identité</th>
                <th className="pb-3 font-medium">Rôle</th>
                <th className="pb-3 font-medium">Facturation</th>
                <th className="pb-3 font-medium">État</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {team.members.map((membership) => (
                <tr key={membership.user.id}>
                  <td className="py-3">
                    <Link
                      href={`/staff/users/${membership.user.id}`}
                      className="font-medium text-primary hover:text-accent"
                    >
                      {membership.user.fullName}
                    </Link>
                    <p className="text-xs text-muted">
                      {membership.user.email}
                    </p>
                  </td>
                  <td className="py-3 text-secondary">{membership.role}</td>
                  <td className="py-3 text-secondary">
                    {membership.canManageBilling ? "Autorisée" : "Non"}
                  </td>
                  <td className="py-3 text-secondary">{membership.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {team.type === "ORGANIZATION" && (
        <section className="rounded-lg border border-border p-5">
          <h2 className="font-semibold text-primary">Invitations</h2>
          <div className="mt-4 space-y-2">
            {team.invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-hover/10 px-4 py-3 text-sm"
              >
                <span>
                  <span className="text-primary">{invitation.email}</span>
                  <span className="ml-2 text-muted">{invitation.role}</span>
                </span>
                <span
                  className={
                    invitation.deliveryStatus === "FAILED"
                      ? "text-red-300"
                      : "text-secondary"
                  }
                >
                  {invitation.status} · email {invitation.deliveryStatus}
                </span>
              </div>
            ))}
            {team.invitations.length === 0 && (
              <p className="text-sm text-muted">Aucune invitation.</p>
            )}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-border p-5">
        <h2 className="font-semibold text-primary">Abonnement</h2>
        <p className="mt-2 text-sm text-secondary">
          {team.subscription
            ? `${team.subscription.plan} · ${team.subscription.status}`
            : "Aucun abonnement enregistré"}
        </p>
      </section>
    </div>
  );
}
