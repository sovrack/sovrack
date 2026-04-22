'use client';

import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { Loader2, Save, Shield, User } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api';
import { usersService } from '@/services/users.service';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const profileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, 'Le nom complet est obligatoire'),
    currentPassword: z.string(),
    newPassword: z.string(),
    confirmNewPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    const wantsPasswordChange =
      data.currentPassword.length > 0 ||
      data.newPassword.length > 0 ||
      data.confirmNewPassword.length > 0;

    if (!wantsPasswordChange) {
      return;
    }

    if (data.currentPassword.length === 0) {
      ctx.addIssue({
        path: ['currentPassword'],
        code: z.ZodIssueCode.custom,
        message: 'Le mot de passe actuel est requis',
      });
    }

    if (data.newPassword.length < 8) {
      ctx.addIssue({
        path: ['newPassword'],
        code: z.ZodIssueCode.custom,
        message: 'Le nouveau mot de passe doit contenir au moins 8 caractères',
      });
    }

    if (data.confirmNewPassword.length === 0) {
      ctx.addIssue({
        path: ['confirmNewPassword'],
        code: z.ZodIssueCode.custom,
        message: 'La confirmation du mot de passe est requise',
      });
    }

    if (
      data.newPassword.length > 0 &&
      data.confirmNewPassword.length > 0 &&
      data.newPassword !== data.confirmNewPassword
    ) {
      ctx.addIssue({
        path: ['confirmNewPassword'],
        code: z.ZodIssueCode.custom,
        message: 'La confirmation ne correspond pas au nouveau mot de passe',
      });
    }
  });

type ProfileForm = z.infer<typeof profileSchema>;
type FormErrors = Partial<Record<keyof ProfileForm, string>>;
type ToastTone = 'success' | 'error';
type ToastState = {
  tone: ToastTone;
  message: string;
} | null;

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [toast, setToast] = useState<ToastState>(null);
  const [form, setForm] = useState<ProfileForm>({
    fullName: user?.fullName ?? '',
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });

  useEffect(() => {
    if (!user?.fullName) {
      return;
    }

    setForm((previous) => ({
      ...previous,
      fullName: user.fullName,
    }));
  }, [user?.fullName]);

  const canSubmit = useMemo(
    () => form.fullName.trim().length > 0 && !saving && Boolean(user),
    [form.fullName, saving, user],
  );

  const setField = <K extends keyof ProfileForm>(field: K, value: ProfileForm[K]) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setToast(null);

    const parsed = profileSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !nextErrors[field as keyof ProfileForm]) {
          nextErrors[field as keyof ProfileForm] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    if (!user) {
      setToast({
        tone: 'error',
        message: 'Session utilisateur introuvable',
      });
      return;
    }

    setSaving(true);
    try {
      const nextFullName = parsed.data.fullName.trim();
      const wantsProfileUpdate = nextFullName !== user.fullName.trim();
      const wantsPasswordChange = parsed.data.newPassword.length > 0;

      if (!wantsProfileUpdate && !wantsPasswordChange) {
        setToast({
          tone: 'success',
          message: 'Aucune modification détectée',
        });
        return;
      }

      if (wantsProfileUpdate) {
        await usersService.update(user.id, { fullName: nextFullName });
        await refreshUser();
      }

      if (wantsPasswordChange) {
        await usersService.changeMyPassword({
          currentPassword: parsed.data.currentPassword,
          newPassword: parsed.data.newPassword,
          confirmNewPassword: parsed.data.confirmNewPassword,
        });
      }

      setForm((previous) => ({
        ...previous,
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      }));

      setToast({
        tone: 'success',
        message: wantsProfileUpdate && wantsPasswordChange
          ? 'Profil et mot de passe mis à jour avec succès'
          : wantsPasswordChange
            ? 'Mot de passe mis à jour avec succès'
            : 'Profil mis à jour avec succès',
      });
    } catch (updateError) {
      setToast({
        tone: 'error',
        message: getApiErrorMessage(updateError),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compte"
        title="Mon profil"
        description="Mettez à jour votre nom et votre mot de passe."
      />

      {toast && (
        <Alert tone={toast.tone === 'success' ? 'success' : 'error'}>
          {toast.message}
        </Alert>
      )}

      <SectionCard className="max-w-3xl" contentClassName="!p-6">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--text-primary)] text-2xl font-bold text-[var(--bg-app)]">
            {user?.fullName?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              Compte
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)] text-[var(--text-secondary)]">{user?.email ?? 'N/A'}</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3 border-[var(--border)]">
            <p className="text-xs font-medium text-[var(--text-secondary)]">Rôle</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)] text-[var(--text-primary)]">
              <Shield size={14} />
              {user?.role === 'ADMIN' ? 'Administrateur' : 'Développeur'}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3 border-[var(--border)]">
            <p className="text-xs font-medium text-[var(--text-secondary)]">Email</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)] text-[var(--text-primary)]">
              <User size={14} />
              {user?.email ?? 'N/A'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Nom complet
            </label>
            <input
              value={form.fullName}
              onChange={(event) => setField('fullName', event.target.value)}
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20 border-[var(--border)] text-[var(--text-primary)]"
            />
            {errors.fullName && (
              <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>
            )}
          </div>

          <div className="h-px bg-[var(--hover)]" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                Mot de passe actuel
              </label>
              <input
                type="password"
                value={form.currentPassword}
                onChange={(event) =>
                  setField('currentPassword', event.target.value)
                }
                placeholder="Saisir uniquement si vous changez le mot de passe"
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20 border-[var(--border)] text-[var(--text-primary)]"
              />
              {errors.currentPassword && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.currentPassword}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={form.newPassword}
                onChange={(event) => setField('newPassword', event.target.value)}
                placeholder="Minimum 8 caractères"
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20 border-[var(--border)] text-[var(--text-primary)]"
              />
              {errors.newPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.newPassword}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                Confirmer le mot de passe
              </label>
              <input
                type="password"
                value={form.confirmNewPassword}
                onChange={(event) =>
                  setField('confirmNewPassword', event.target.value)
                }
                placeholder="Répéter le nouveau mot de passe"
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-2 focus:ring-zinc-500/20 border-[var(--border)] text-[var(--text-primary)]"
              />
              {errors.confirmNewPassword && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.confirmNewPassword}
                </p>
              )}
            </div>
          </div>

          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Enregistrer les modifications
          </Button>
        </form>
      </SectionCard>
    </div>
  );
}
