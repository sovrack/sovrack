'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import { teamsService } from '@/services/teams.service';
import { getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type { Team } from '@/types/team';

type ToastTone = 'success' | 'error';
type ToastItem = { id: number; message: string; tone: ToastTone };

export default function AdminTeamsPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAuth();

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await teamsService.getAll();
      setTeams(rows);
    } catch (err) {
      setError(getApiErrorMessage(err));
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
      void fetchTeams();
    }
  }, [authLoading, isAdmin, fetchTeams, router]);

  const handleDelete = async (team: Team) => {
    const confirmed = window.confirm(`Supprimer l'équipe "${team.name}" ?`);
    if (!confirmed) return;

    setDeletingId(team.id);
    try {
      await teamsService.remove(team.id);
      setTeams((prev) => prev.filter((t) => t.id !== team.id));
      showToast('Équipe supprimée avec succès', 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl border border-slate-200 bg-white" />
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
              Gestion des équipes
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Créez et gérez les équipes de développeurs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchTeams()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <Link
              href="/admin/teams/new"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-600"
            >
              <Plus size={16} />
              Créer une équipe
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">Total équipes</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{teams.length}</p>
          </div>
          <div className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-brand-700">
              <Users size={14} />
              Total membres
            </div>
            <p className="mt-1 text-2xl font-semibold text-brand-800">
              {teams.reduce((acc, t) => acc + t.members.length, 0)}
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
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50">
              <Users size={24} className="text-brand-500" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-900">
              Aucune équipe pour l&apos;instant
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Créez votre première équipe pour organiser vos développeurs.
            </p>
            <Link
              href="/admin/teams/new"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              <Plus size={16} />
              Créer une équipe
            </Link>
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
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Membres
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teams.map((team) => (
                  <tr key={team.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{team.name}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {team.description ?? <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                        <Users size={12} />
                        {team.members.length}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/teams/${team.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                        >
                          <Pencil size={13} />
                          Gérer
                        </Link>
                        <button
                          onClick={() => void handleDelete(team)}
                          disabled={deletingId === team.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === team.id ? (
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
              toast.tone === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
