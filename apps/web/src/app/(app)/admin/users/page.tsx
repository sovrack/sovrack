'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { usersService } from '@/services/users.service';
import { getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type { UserListItem } from '@/types/user';

type RoleFilter = 'ALL' | 'ADMIN' | 'DEVELOPER';
type ToastTone = 'success' | 'error';

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

function formatDate(value: string): string {
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(asDate);
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading, user: currentUser } = useAuth();

  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, tone }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2600);
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await usersService.getAll();
      setUsers(rows);
    } catch (fetchError) {
      setError(getApiErrorMessage(fetchError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace('/access-denied');
      return;
    }

    if (!authLoading && isAdmin) {
      void fetchUsers();
    }
  }, [authLoading, isAdmin, fetchUsers, router]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((item) => {
      const roleMatch = roleFilter === 'ALL' ? true : item.role === roleFilter;
      const searchMatch =
        query.length === 0 ||
        item.fullName.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query);

      return roleMatch && searchMatch;
    });
  }, [users, search, roleFilter]);

  const handleToggleActive = async (userId: string) => {
    setTogglingId(userId);
    try {
      const updated = await usersService.toggleActive(userId);
      setUsers((prev) =>
        prev.map((item) => (item.id === userId ? updated : item)),
      );
      showToast(
        updated.isActive
          ? 'Utilisateur activé avec succès'
          : 'Utilisateur désactivé avec succès',
        'success',
      );
    } catch (toggleError) {
      const message = getApiErrorMessage(toggleError);
      showToast(message, 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (target: UserListItem) => {
    if (target.id === currentUser?.id) {
      showToast('Vous ne pouvez pas supprimer votre propre compte', 'error');
      return;
    }

    const confirmed = window.confirm(
      `Supprimer l'utilisateur "${target.fullName}" ?`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingId(target.id);
    try {
      await usersService.delete(target.id);
      setUsers((prev) => prev.filter((item) => item.id !== target.id));
      showToast('Utilisateur supprimé avec succès', 'success');
    } catch (deleteError) {
      showToast(getApiErrorMessage(deleteError), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((index) => (
          <div
            key={index}
            className="h-14 animate-pulse rounded-xl border border-slate-200 bg-white"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-theme-xs md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-600">
              Administration
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-900">
              Gestion des utilisateurs
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Gérez les comptes admin et développeur depuis un seul tableau.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchUsers()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <Link
              href="/admin/users/new"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-600"
            >
              <Plus size={16} />
              Créer un utilisateur
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">Total utilisateurs</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {users.length}
            </p>
          </div>
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-700">
              <Shield size={14} />
              Admins
            </div>
            <p className="mt-1 text-2xl font-semibold text-indigo-800">
              {users.filter((item) => item.role === 'ADMIN').length}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
              <Users size={14} />
              Développeurs actifs
            </div>
            <p className="mt-1 text-2xl font-semibold text-emerald-800">
              {
                users.filter(
                  (item) => item.role === 'DEVELOPER' && item.isActive,
                ).length
              }
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-theme-xs">
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par nom ou email..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
            className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
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
                className="h-14 animate-pulse rounded-xl bg-slate-100"
              />
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50">
              <Users size={24} className="text-brand-500" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-900">
              Aucun utilisateur trouvé
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Ajustez votre recherche ou créez un nouveau compte.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nom
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Rôle
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Statut
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Date création
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900">{item.fullName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {item.email}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          item.role === 'ADMIN'
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {item.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          item.isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.isActive ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/users/${item.id}/edit`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                          <Pencil size={13} />
                          Modifier
                        </Link>
                        <button
                          onClick={() => void handleToggleActive(item.id)}
                          disabled={togglingId === item.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                        >
                          {togglingId === item.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : item.isActive ? (
                            <UserMinus size={13} />
                          ) : (
                            <UserPlus size={13} />
                          )}
                          {item.isActive ? 'Désactiver' : 'Activer'}
                        </button>
                        <button
                          onClick={() => void handleDelete(item)}
                          disabled={deletingId === item.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === item.id ? (
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
      </section>

      <div className="pointer-events-none fixed right-4 top-4 z-[100] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.tone === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
