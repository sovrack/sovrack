'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Save,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { teamsService } from '@/services/teams.service';
import { usersService } from '@/services/users.service';
import { getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type { Team } from '@/types/team';
import type { UserListItem } from '@/types/user';

type Props = { params: Promise<{ id: string }> };

const editTeamSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire'),
  description: z.string().trim().optional(),
});

type FormData = z.infer<typeof editTeamSchema>;
type FormErrors = Partial<Record<keyof FormData, string>>;
type ToastState = { message: string; tone: 'success' | 'error' } | null;

export default function TeamDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAuth();

  const [team, setTeam] = useState<Team | null>(null);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [form, setForm] = useState<FormData>({ name: '', description: '' });

  const showToast = useCallback((message: string, tone: 'success' | 'error') => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedTeam, fetchedUsers] = await Promise.all([
        teamsService.getById(id),
        usersService.getAll(),
      ]);
      setTeam(fetchedTeam);
      setForm({
        name: fetchedTeam.name,
        description: fetchedTeam.description ?? '',
      });
      setUsers(fetchedUsers);
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace('/access-denied');
      return;
    }
    if (!authLoading && isAdmin) {
      void loadData();
    }
  }, [authLoading, isAdmin, loadData, router]);

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
        if (typeof field === 'string' && !nextErrors[field as keyof FormData]) {
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
      setTeam(updated);
      showToast('Équipe mise à jour', 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async (userId: string) => {
    setAddingUserId(userId);
    try {
      const updated = await teamsService.addMember(id, { userId });
      setTeam(updated);
      showToast('Membre ajouté', 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setAddingUserId(null);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setRemovingUserId(userId);
    try {
      const updated = await teamsService.removeMember(id, userId);
      setTeam(updated);
      showToast('Membre retiré', 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err), 'error');
    } finally {
      setRemovingUserId(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-card)]" />
        ))}
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>Équipe introuvable.</span>
      </div>
    );
  }

  const memberIds = new Set(team.members.map((m) => m.userId));
  const availableUsers = users.filter((u) => !memberIds.has(u.id));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title={team.name}
        description="Modifiez les informations et gérez les membres de cette équipe."
        actions={
          <Link
            href="/admin/teams"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-secondary)]"
          >
            <ArrowLeft size={15} />
            Retour à la liste
          </Link>
        }
      />

      {toast && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            toast.tone === 'success'
              ? 'border border-green-200 bg-green-50 text-green-700'
              : 'border border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      <SectionCard title="Informations de l&apos;équipe">
        <form onSubmit={handleSave} className="space-y-4">

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Nom <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
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
              onChange={(e) => setField('description', e.target.value)}
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
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Enregistrer
          </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title={`Membres (${team.members.length})`}>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)] text-[var(--text-primary)]">
            <Users size={18} className="text-[var(--text-secondary)]" />
            Membres
          </div>

          {team.members.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Aucun membre pour l&apos;instant.</p>
          ) : (
            <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] border-[var(--border)]">
              {team.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)] text-[var(--text-primary)]">{member.user.fullName}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{member.user.email}</p>
                  </div>
                  <button
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
              ))}
            </div>
          )}

          {availableUsers.length > 0 && (
            <div className="pt-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                Ajouter un membre
              </p>
              <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] border-[var(--border)]">
                {availableUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)] text-[var(--text-primary)]">{user.fullName}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{user.email}</p>
                    </div>
                    <button
                      onClick={() => void handleAddMember(user.id)}
                      disabled={addingUserId === user.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--hover)] disabled:opacity-50"
                    >
                      {addingUserId === user.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <UserPlus size={13} />
                      )}
                      Ajouter
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Zone dangereuse"
        description="La suppression de cette équipe est irréversible."
        className="border-red-200 bg-red-50"
      >
        <button
          onClick={() => setConfirmDeleteOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-[var(--bg-card)] px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100"
        >
          <Trash2 size={15} />
          Supprimer l&apos;équipe
        </button>
      </SectionCard>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Supprimer l'équipe "${team.name}"`}
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        onConfirm={async () => {
          setConfirmDeleteOpen(false);
          try {
            await teamsService.remove(id);
            router.push('/admin/teams');
          } catch (err) {
            showToast(getApiErrorMessage(err), 'error');
          }
        }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
