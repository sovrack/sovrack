"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Save,
  Archive,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { SectionCard } from "@/shared/layout/section-card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { teamsService } from "@/features/teams/api/teams.service";
import { useTeam, teamKey } from "@/features/teams/api/use-teams";
import { getApiErrorMessage } from "@/shared/lib/api";
import { useAuth } from "@/features/auth/api/use-auth";
import type { WorkspaceRole } from "@/features/teams/types/team";
import { workspaceRoleLabel } from "@/shared/i18n/product-labels";
import { useWorkspaceStore } from "@/stores/workspace.store";

type Props = { params: Promise<{ id: string }> };

const editTeamSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire"),
  description: z.string().trim().optional(),
});

type FormData = z.infer<typeof editTeamSchema>;
type FormErrors = Partial<Record<keyof FormData, string>>;
type ToastState = { message: string; tone: "success" | "error" } | null;

export default function TeamDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { loading: authLoading } = useAuth();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const selectWorkspace = useWorkspaceStore((state) => state.selectWorkspace);
  const setWorkspaces = useWorkspaceStore((state) => state.setWorkspaces);
  const targetWorkspace = workspaces.find((workspace) => workspace.id === id);
  const workspaceRole = targetWorkspace?.role ?? null;
  const isAdmin = workspaceRole === "OWNER" || workspaceRole === "ADMIN";
  const isOwner = workspaceRole === "OWNER";

  const queryClient = useQueryClient();
  const canQuery = !authLoading && Boolean(targetWorkspace);
  const teamQuery = useTeam(id, canQuery);
  const team = teamQuery.data ?? null;
  const invitationsQuery = useQuery({
    queryKey: ["workspace-invitations", id],
    queryFn: () => teamsService.listInvitations(id),
    enabled: canQuery && isAdmin && team?.type === "ORGANIZATION",
  });
  const invitations = invitationsQuery.data ?? [];
  const loading = teamQuery.isLoading || invitationsQuery.isLoading;

  useEffect(() => {
    if (targetWorkspace) selectWorkspace(id);
  }, [id, selectWorkspace, targetWorkspace]);

  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [form, setForm] = useState<FormData>({ name: "", description: "" });
  const [hydrated, setHydrated] = useState(false);

  const showToast = useCallback(
    (message: string, tone: "success" | "error") => {
      setToast({ message, tone });
      window.setTimeout(() => setToast(null), 2600);
    },
    [],
  );

  // Seules les identités qui appartiennent à l'espace peuvent ouvrir sa fiche.
  useEffect(() => {
    if (!authLoading && !targetWorkspace) {
      router.replace("/access-denied");
    }
  }, [authLoading, router, targetWorkspace]);

  // Hydrate le formulaire une seule fois, dès que l'équipe est chargée.
  useEffect(() => {
    if (team && !hydrated) {
      setForm({ name: team.name, description: team.description ?? "" });
      setHydrated(true);
    }
  }, [team, hydrated]);

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = editTeamSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !nextErrors[field as keyof FormData]) {
          nextErrors[field as keyof FormData] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const updated = await teamsService.update(id, {
        name: parsed.data.name,
        description: parsed.data.description || undefined,
      });
      queryClient.setQueryData(teamKey(id), updated);
      showToast("Espace mis à jour", "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviting(true);
    try {
      await teamsService.invite(id, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteEmail("");
      setInviteRole("MEMBER");
      await invitationsQuery.refetch();
      showToast("Invitation envoyée", "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setInviting(false);
    }
  };

  const handleConvert = async () => {
    setConverting(true);
    try {
      const converted = await teamsService.convertToOrganization(id, form.name);
      queryClient.setQueryData(teamKey(id), converted);
      await queryClient.invalidateQueries({ queryKey: ["teams"] });
      showToast("L’espace est maintenant une organisation.", "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setConverting(false);
    }
  };

  const handleRoleChange = async (userId: string, role: WorkspaceRole) => {
    try {
      const updated = await teamsService.updateMemberRole(id, userId, role);
      queryClient.setQueryData(teamKey(id), updated);
      showToast("Rôle du membre mis à jour", "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setRemovingUserId(userId);
    try {
      const updated = await teamsService.removeMember(id, userId);
      queryClient.setQueryData(teamKey(id), updated);
      showToast("Membre retiré", "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleStatusChange = async (
    userId: string,
    status: "ACTIVE" | "SUSPENDED",
  ) => {
    try {
      const updated = await teamsService.updateMemberStatus(id, userId, status);
      queryClient.setQueryData(teamKey(id), updated);
      showToast(
        status === "ACTIVE" ? "Membre réactivé" : "Membre suspendu",
        "success",
      );
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    }
  };

  const handleBillingAccessChange = async (
    userId: string,
    canManageBilling: boolean,
  ) => {
    try {
      const updated = await teamsService.updateMemberBillingAccess(
        id,
        userId,
        canManageBilling,
      );
      queryClient.setQueryData(teamKey(id), updated);
      showToast("Permission de facturation mise à jour", "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    }
  };

  const handleLeave = async () => {
    try {
      await teamsService.leave(id);
      const remainingWorkspaces = await teamsService.getAll();
      setWorkspaces(remainingWorkspaces);
      queryClient.removeQueries({ queryKey: teamKey(id) });
      router.replace("/admin/teams");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
          />
        ))}
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>Espace de travail introuvable.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Espace de travail"
        title={team.name}
        description={
          team.type === "PERSONAL"
            ? "Espace personnel réservé à votre usage."
            : isAdmin
              ? "Gérez les informations, les membres et leurs rôles."
              : "Consultez les membres et votre rôle dans cette organisation."
        }
        actions={
          <Link
            href="/admin/teams"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-secondary)]"
          >
            <ArrowLeft size={15} />
            Retour aux espaces
          </Link>
        }
      />

      {toast && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            toast.tone === "success"
              ? "border border-green-200 bg-green-50 text-green-700"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {toast.message}
        </div>
      )}

      {isAdmin ? (
        <SectionCard title="Informations de l’espace">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                  Nom <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:bg-[var(--bg-card)] focus:ring-2 focus:ring-zinc-100"
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-600">{errors.name}</p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:bg-[var(--bg-card)] focus:ring-2 focus:ring-zinc-100"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:bg-[var(--text-primary)] disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Save size={15} />
                )}
                Enregistrer
              </button>
            </div>
          </form>
        </SectionCard>
      ) : (
        <SectionCard title="Informations de l’espace">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--text-muted)]">Nom</dt>
              <dd className="mt-1 font-medium text-[var(--text-primary)]">
                {team.name}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">Votre rôle</dt>
              <dd className="mt-1 font-medium text-[var(--text-primary)]">
                {workspaceRole}
              </dd>
            </div>
            {team.description && (
              <div className="sm:col-span-2">
                <dt className="text-[var(--text-muted)]">Description</dt>
                <dd className="mt-1 text-[var(--text-secondary)]">
                  {team.description}
                </dd>
              </div>
            )}
          </dl>
        </SectionCard>
      )}

      {team.type === "PERSONAL" ? (
        <SectionCard
          title="Espace personnel"
          description="Cet espace est limité à un seul utilisateur et ne permet pas les invitations."
        >
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Si vous souhaitez collaborer, convertissez-le en organisation.
              Cette conversion est définitive et conservera vos projets,
              serveurs et déploiements.
            </p>
            <button
              type="button"
              onClick={() => void handleConvert()}
              disabled={converting || workspaceRole !== "OWNER"}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] disabled:opacity-50"
            >
              {converting && <Loader2 size={14} className="animate-spin" />}
              Convertir en organisation
            </button>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title={`Membres (${team.members.length})`}>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
              <Users size={18} className="text-[var(--text-secondary)]" />
              Membres
            </div>

            {team.members.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                Aucun membre.
              </p>
            ) : (
              <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
                {team.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {member.user.fullName}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {member.user.email}
                      </p>
                    </div>
                    {isAdmin ? (
                      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            void handleStatusChange(
                              member.userId,
                              member.status === "ACTIVE"
                                ? "SUSPENDED"
                                : "ACTIVE",
                            )
                          }
                          className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                        >
                          {member.status === "ACTIVE"
                            ? "Suspendre"
                            : "Réactiver"}
                        </button>
                        <select
                          aria-label={`Role de ${member.user.email}`}
                          value={member.role}
                          onChange={(event) =>
                            void handleRoleChange(
                              member.userId,
                              event.target.value as WorkspaceRole,
                            )
                          }
                          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs"
                        >
                          <option value="MEMBER">Membre</option>
                          {workspaceRole === "OWNER" && (
                            <option value="ADMIN">Admin</option>
                          )}
                          {workspaceRole === "OWNER" && (
                            <option value="OWNER">Propriétaire</option>
                          )}
                        </select>
                        {workspaceRole === "OWNER" && (
                          <label className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={member.canManageBilling}
                              onChange={(event) =>
                                void handleBillingAccessChange(
                                  member.userId,
                                  event.target.checked,
                                )
                              }
                            />
                            Facturation
                          </label>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleRemoveMember(member.userId)}
                          disabled={removingUserId === member.userId}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          {removingUserId === member.userId ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <UserMinus size={13} />
                          )}
                          Retirer
                        </button>
                      </div>
                    ) : (
                      <div className="flex w-full flex-wrap gap-2 text-xs text-[var(--text-secondary)] sm:w-auto">
                        <span className="rounded-full border border-[var(--border)] px-2.5 py-1">
                          {workspaceRoleLabel(member.role)}
                        </span>
                        <span className="rounded-full border border-[var(--border)] px-2.5 py-1">
                          {member.status === "ACTIVE" ? "Actif" : "Suspendu"}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isAdmin && (
              <form
                onSubmit={handleInvite}
                className="flex flex-wrap gap-2 pt-2"
              >
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="member@example.com"
                  className="h-10 min-w-64 flex-1 rounded-xl border border-[var(--border)] bg-[var(--hover)] px-3 text-sm"
                />
                <select
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(event.target.value as WorkspaceRole)
                  }
                  className="h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm"
                >
                  <option value="MEMBER">Membre</option>
                  {workspaceRole === "OWNER" && (
                    <option value="ADMIN">Admin</option>
                  )}
                </select>
                <button
                  type="submit"
                  disabled={inviting}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-app)] disabled:opacity-50"
                >
                  {inviting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <UserPlus size={14} />
                  )}
                  Inviter
                </button>
              </form>
            )}

            {isAdmin && invitations.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                  Invitations en attente
                </p>
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
                  >
                    <span>
                      {invitation.email} · {invitation.role}
                      <span
                        className={`ml-2 text-xs ${
                          invitation.deliveryStatus === "FAILED"
                            ? "text-red-500"
                            : "text-[var(--text-secondary)]"
                        }`}
                      >
                        Email{" "}
                        {invitation.deliveryStatus === "SENT"
                          ? "envoyé"
                          : invitation.deliveryStatus === "FAILED"
                            ? "en échec"
                            : "en attente"}
                      </span>
                    </span>
                    <span className="flex gap-3">
                      {invitation.status === "PENDING" && (
                        <button
                          type="button"
                          onClick={() =>
                            void teamsService
                              .resendInvitation(id, invitation.id)
                              .then(() => invitationsQuery.refetch())
                          }
                          className="text-xs font-semibold text-sky-500"
                        >
                          Renvoyer
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void teamsService
                            .revokeInvitation(id, invitation.id)
                            .then(() => invitationsQuery.refetch())
                        }
                        className="text-xs font-semibold text-red-500"
                      >
                        Révoquer
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {team.type === "ORGANIZATION" && (
        <SectionCard
          title="Quitter l’organisation"
          description={
            isOwner
              ? "Un propriétaire doit d’abord nommer un autre OWNER si aucun autre propriétaire actif n’existe."
              : "Votre accès, votre rôle et vos droits projet dans cette organisation seront retirés."
          }
          className="border-amber-500/30"
        >
          <button
            type="button"
            onClick={() => setConfirmLeaveOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 px-4 py-2.5 text-sm font-semibold text-amber-500 transition hover:bg-amber-500/10"
          >
            <UserMinus size={15} />
            Quitter l’organisation
          </button>
        </SectionCard>
      )}

      {isOwner && (
        <SectionCard
          title="Archivage"
          description="L'archivage coupe les accès sans supprimer les projets, serveurs ni historiques."
          className="border-red-200 bg-red-50"
        >
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-[var(--bg-card)] px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100"
          >
            <Archive size={15} />
            Archiver l’espace
          </button>
        </SectionCard>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Archiver l’espace « ${team.name} »`}
        description="Les accès seront coupés, mais les ressources resteront conservées."
        confirmLabel="Archiver"
        cancelLabel="Annuler"
        onConfirm={async () => {
          setConfirmDeleteOpen(false);
          try {
            await teamsService.remove(id);
            router.push("/admin/teams");
          } catch (err) {
            showToast(getApiErrorMessage(err), "error");
          }
        }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
      <ConfirmDialog
        open={confirmLeaveOpen}
        title={`Quitter « ${team.name} »`}
        description="Cette action retire immédiatement vos accès à l’organisation et à ses projets. Elle ne supprime aucune ressource de l’organisation."
        confirmLabel="Quitter l’organisation"
        cancelLabel="Annuler"
        onConfirm={async () => {
          setConfirmLeaveOpen(false);
          await handleLeave();
        }}
        onCancel={() => setConfirmLeaveOpen(false)}
      />
    </div>
  );
}
