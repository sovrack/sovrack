"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { SectionCard } from "@/shared/layout/section-card";
import { Pagination } from "@/shared/ui/pagination";
import { usePagination } from "@/shared/hooks/use-pagination";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { useToasts } from "@/shared/hooks/use-toasts";
import { UserCreateDialog } from "@/features/users/components/user-create-dialog";
import { TeamCreateDialog } from "@/features/teams";
import { usersService } from "@/features/users/api/users.service";
import { teamsService } from "@/features/teams/api/teams.service";
import { getApiErrorMessage } from "@/shared/lib/api";
import { useAuth } from "@/features/auth/api/use-auth";
import { UserRow } from "@/features/users/components/user-row";
import type { UserListItem } from "@/features/users/types/user";
import type { Team } from "@/features/teams/types/team";

type RoleFilter = "ALL" | "ADMIN" | "DEVELOPER";

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin, loading: authLoading, user: currentUser } = useAuth();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const { toasts, showToast } = useToasts(2600);
  const [confirmUser, setConfirmUser] = useState<UserListItem | null>(null);
  const [confirmTeam, setConfirmTeam] = useState<Team | null>(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const queryClient = useQueryClient();

  const {
    data: users = [],
    isLoading: loadingUsers,
    error: usersQueryError,
  } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => usersService.getAll(),
    enabled: !authLoading && isAdmin,
  });

  const {
    data: teams = [],
    isLoading: loadingTeams,
    error: teamsQueryError,
  } = useQuery({
    queryKey: ["admin-teams"],
    queryFn: () => teamsService.getAll(),
    enabled: !authLoading && isAdmin,
  });

  const usersError = usersQueryError
    ? getApiErrorMessage(usersQueryError)
    : null;
  const teamsError = teamsQueryError
    ? getApiErrorMessage(teamsQueryError)
    : null;
  const loading = loadingUsers || loadingTeams;

  const clearDialogQuery = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (!next.has("dialog")) {
      return;
    }

    next.delete("dialog");
    const query = next.toString();
    router.replace(query ? `/admin/users?${query}` : "/admin/users");
  }, [router, searchParams]);

  useEffect(() => {
    const dialog = searchParams.get("dialog");
    if (dialog === "create-user") {
      setCreateUserOpen(true);
    } else if (dialog === "create-team") {
      setCreateTeamOpen(true);
    }
  }, [searchParams]);

  const handleCloseCreateUser = useCallback(() => {
    setCreateUserOpen(false);
    clearDialogQuery();
  }, [clearDialogQuery]);

  const handleCloseCreateTeam = useCallback(() => {
    setCreateTeamOpen(false);
    clearDialogQuery();
  }, [clearDialogQuery]);

  const handleUserCreated = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    showToast("Utilisateur créé avec succès", "success");
  }, [queryClient, showToast]);

  const handleTeamCreated = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-teams"] });
    showToast("Équipe créée avec succès", "success");
  }, [queryClient, showToast]);

  if (!authLoading && !isAdmin) {
    router.replace("/access-denied");
  }

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((item) => {
      const roleMatch = roleFilter === "ALL" ? true : item.role === roleFilter;
      const searchMatch =
        query.length === 0 ||
        item.fullName.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query);

      return roleMatch && searchMatch;
    });
  }, [users, search, roleFilter]);

  const {
    page,
    totalPages,
    paged: pagedUsers,
    goToPage,
    reset: resetPage,
  } = usePagination(filteredUsers, { pageSize: 20 });

  useEffect(() => {
    resetPage();
  }, [search, roleFilter, resetPage]);

  const handleToggleActive = async (userId: string) => {
    setTogglingId(userId);
    try {
      const updated = await usersService.toggleActive(userId);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      showToast(
        updated.isActive
          ? "Utilisateur activé avec succès"
          : "Utilisateur désactivé avec succès",
        "success",
      );
    } catch (toggleError) {
      showToast(getApiErrorMessage(toggleError), "error");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = (target: UserListItem) => {
    if (target.id === currentUser?.id) {
      showToast("Vous ne pouvez pas supprimer votre propre compte", "error");
      return;
    }
    setConfirmUser(target);
  };

  const confirmDelete = async () => {
    if (!confirmUser) return;
    setDeletingUserId(confirmUser.id);
    setConfirmUser(null);
    try {
      await usersService.delete(confirmUser.id);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      showToast("Utilisateur supprimé avec succès", "success");
    } catch (deleteError) {
      showToast(getApiErrorMessage(deleteError), "error");
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleDeleteTeam = (target: Team) => {
    setConfirmTeam(target);
  };

  const confirmDeleteTeam = async () => {
    if (!confirmTeam) return;
    setDeletingTeamId(confirmTeam.id);
    setConfirmTeam(null);
    try {
      await teamsService.remove(confirmTeam.id);
      await queryClient.invalidateQueries({ queryKey: ["admin-teams"] });
      showToast("Équipe supprimée avec succès", "success");
    } catch (deleteError) {
      showToast(getApiErrorMessage(deleteError), "error");
    } finally {
      setDeletingTeamId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((index) => (
          <div
            key={index}
            className="h-14 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Utilisateurs & Équipes"
        description="Gérez les utilisateurs et les équipes depuis une seule page."
        actions={
          <>
            <button
              type="button"
              onClick={() => setCreateUserOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] shadow transition hover:bg-[var(--text-primary)]"
            >
              <Plus size={16} />
              Créer un utilisateur
            </button>
            <button
              type="button"
              onClick={() => setCreateTeamOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] shadow transition hover:bg-[var(--hover)]"
            >
              <Plus size={16} />
              Créer une équipe
            </button>
          </>
        }
      />

      <SectionCard contentClassName="!p-6">
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-muted)]">
              Total utilisateurs
            </p>
            <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
              {users.length}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
              <Shield size={14} />
              Admins
            </div>
            <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
              {users.filter((item) => item.role === "ADMIN").length}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
              <Users size={14} />
              Développeurs actifs
            </div>
            <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
              {
                users.filter(
                  (item) => item.role === "DEVELOPER" && item.isActive,
                ).length
              }
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-muted)]">
              Total équipes
            </p>
            <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
              {teams.length}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="text-xs font-medium text-[var(--text-muted)]">
              Membres d'équipes
            </p>
            <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
              {teams.reduce((total, team) => total + team.members.length, 0)}
            </p>
          </div>
        </div>
      </SectionCard>

      {usersError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{usersError}</span>
        </div>
      )}
      {teamsError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{teamsError}</span>
        </div>
      )}

      <SectionCard title="Utilisateurs" contentClassName="!p-5 sm:!p-6">
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par nom ou email..."
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--hover)] pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:bg-[var(--bg-card)] focus:ring-2 focus:ring-[var(--primary)] bg-[var(--bg-card)]"
            />
          </label>

          <select
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(event.target.value as RoleFilter)
            }
            className="h-11 rounded-xl border border-[var(--border)] bg-[var(--hover)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:bg-[var(--bg-card)] focus:ring-2 focus:ring-[var(--primary)] bg-[var(--bg-card)]"
          >
            <option value="ALL">Tous les rôles</option>
            <option value="ADMIN">ADMIN</option>
            <option value="DEVELOPER">DEVELOPER</option>
          </select>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((index) => (
              <div
                key={index}
                className="h-14 animate-pulse rounded-xl bg-[var(--hover)] bg-[var(--bg-card)]"
              />
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--hover)] px-6 py-12 text-center bg-[var(--bg-card)]">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--hover)] bg-[var(--bg-card)]">
              <Users size={24} className="text-[var(--text-secondary)]" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-[var(--text-primary)]">
              Aucun utilisateur trouvé
            </h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Ajustez votre recherche ou créez un nouveau compte.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--hover)] bg-[var(--bg-card)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Nom
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Rôle
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Statut
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Créé le
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {pagedUsers.map((item) => (
                  <UserRow
                    key={item.id}
                    user={item}
                    onToggleActive={(id) => void handleToggleActive(id)}
                    onDelete={(u) => void handleDelete(u)}
                    togglingId={togglingId}
                    deletingUserId={deletingUserId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={goToPage}
          className="mt-4"
        />
      </SectionCard>

      <SectionCard title="Équipes" contentClassName="!p-5 sm:!p-6">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((index) => (
              <div
                key={index}
                className="h-14 animate-pulse rounded-xl bg-[var(--hover)] bg-[var(--bg-card)]"
              />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--hover)] px-6 py-12 text-center bg-[var(--bg-card)]">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--hover)] bg-[var(--bg-card)]">
              <Users size={24} className="text-[var(--text-secondary)]" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-[var(--text-primary)]">
              Aucune équipe pour l'instant
            </h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Créez votre première équipe pour organiser vos développeurs.
            </p>
            <button
              type="button"
              onClick={() => setCreateTeamOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:bg-[var(--text-primary)]"
            >
              <Plus size={16} />
              Créer une équipe
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--hover)] bg-[var(--bg-card)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Nom
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Membres
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {teams.map((team) => (
                  <tr key={team.id} className="hover:bg-[var(--hover)]">
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {team.name}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {team.description ?? (
                        <span className="italic text-[var(--text-secondary)]">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--hover)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                        <Users size={12} />
                        {team.members.length}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/teams/${team.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--hover)] text-[var(--text-primary)]"
                        >
                          <Pencil size={13} />
                          Gérer
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDeleteTeam(team)}
                          disabled={deletingTeamId === team.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingTeamId === team.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={Boolean(confirmUser)}
        title={`Supprimer l'utilisateur "${confirmUser?.fullName ?? ""}"`}
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        loading={Boolean(deletingUserId)}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmUser(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmTeam)}
        title={`Supprimer l'équipe "${confirmTeam?.name ?? ""}"`}
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        loading={Boolean(deletingTeamId)}
        onConfirm={() => void confirmDeleteTeam()}
        onCancel={() => setConfirmTeam(null)}
      />

      <UserCreateDialog
        open={createUserOpen}
        onClose={handleCloseCreateUser}
        onCreated={handleUserCreated}
      />

      <TeamCreateDialog
        open={createTeamOpen}
        onClose={handleCloseCreateTeam}
        onCreated={handleTeamCreated}
      />

      <div className="pointer-events-none fixed right-4 top-4 z-[100] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.tone === "success"
                ? "bg-emerald-500 text-white"
                : "bg-red-500 text-white"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}