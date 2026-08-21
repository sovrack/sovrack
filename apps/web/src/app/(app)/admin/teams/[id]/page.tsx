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
  Trash2,
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
  const { user, loading: authLoading } = useAuth();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const selectWorkspace = useWorkspaceStore((state) => state.selectWorkspace);
  const targetMembership = workspaces
    .find((workspace) => workspace.id === id)
    ?.members.find((member) => member.userId === user?.id);
  const workspaceRole = targetMembership?.role ?? null;
  const isAdmin = workspaceRole === "OWNER" || workspaceRole === "ADMIN";

  const queryClient = useQueryClient();
  const canQuery = !authLoading && isAdmin;
  const teamQuery = useTeam(id, canQuery);
  const team = teamQuery.data ?? null;
  const invitationsQuery = useQuery({
    queryKey: ["workspace-invitations", id],
    queryFn: () => teamsService.listInvitations(id),
    enabled: canQuery,
  });
  const invitations = invitationsQuery.data ?? [];
  const loading = teamQuery.isLoading || invitationsQuery.isLoading;

  useEffect(() => {
    if (isAdmin) selectWorkspace(id);
  }, [id, isAdmin, selectWorkspace]);

  const [saving, setSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
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

  // Redirige les non-admins ; le chargement des données passe par React Query.
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace("/access-denied");
    }
  }, [authLoading, isAdmin, router]);

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
      showToast("Team updated", "success");
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
      showToast("Invitation sent", "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, role: WorkspaceRole) => {
    try {
      const updated = await teamsService.updateMemberRole(id, userId, role);
      queryClient.setQueryData(teamKey(id), updated);
      showToast("Member role updated", "success");
    } catch (err) {
      showToast(getApiErrorMessage(err), "error");
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setRemovingUserId(userId);
    try {
      const updated = await teamsService.removeMember(id, userId);
      queryClient.setQueryData(teamKey(id), updated);
      showToast("Member removed", "success");
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
        status === "ACTIVE" ? "Member reactivated" : "Member suspended",
        "success",
      );
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
        <span>Team not found.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title={team.name}
        description="Edit the details and manage this team's members."
        actions={
          <Link
            href="/admin/teams"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-secondary)]"
          >
            <ArrowLeft size={15} />
            Back to list
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

      <SectionCard title="Team information">
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
              Save
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title={`Membres (${team.members.length})`}>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
            <Users size={18} className="text-[var(--text-secondary)]" />
            Membres
          </div>

          {team.members.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No members yet.
            </p>
          ) : (
            <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
              {team.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {member.user.fullName}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {member.user.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void handleStatusChange(
                          member.userId,
                          member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
                        )
                      }
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                    >
                      {member.status === "ACTIVE" ? "Suspendre" : "Réactiver"}
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
                      <option value="MEMBER">Member</option>
                      {workspaceRole === "OWNER" && (
                        <option value="ADMIN">Admin</option>
                      )}
                      {workspaceRole === "OWNER" && (
                        <option value="OWNER">Owner</option>
                      )}
                    </select>
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
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleInvite} className="flex flex-wrap gap-2 pt-2">
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
              <option value="MEMBER">Member</option>
              {workspaceRole === "OWNER" && <option value="ADMIN">Admin</option>}
              {workspaceRole === "OWNER" && <option value="OWNER">Owner</option>}
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 text-sm font-semibold text-[var(--bg-app)] disabled:opacity-50"
            >
              {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Invite
            </button>
          </form>

          {invitations.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                Pending invitations
              </p>
              {invitations.map((invitation) => (
                <div key={invitation.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-sm">
                  <span>{invitation.email} · {invitation.role}</span>
                  <button
                    type="button"
                    onClick={() => void teamsService.revokeInvitation(id, invitation.id).then(() => invitationsQuery.refetch())}
                    className="text-xs font-semibold text-red-500"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Zone dangereuse"
        description="Deleting this team cannot be undone."
        className="border-red-200 bg-red-50"
      >
        <button
          type="button"
          onClick={() => setConfirmDeleteOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-[var(--bg-card)] px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100"
        >
          <Trash2 size={15} />
          Delete team
        </button>
      </SectionCard>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Delete team "${team.name}"`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
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
    </div>
  );
}
