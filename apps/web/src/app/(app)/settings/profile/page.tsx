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

export default function ProfileSettingsPage() {
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
        await usersService.updateMyProfile({ fullName: nextFullName });
      }

      if (wantsPasswordChange) {
        await usersService.changePassword({
          currentPassword: parsed.data.currentPassword,
          newPassword: parsed.data.newPassword,
        });
      }

      await refreshUser();
      setForm({
        fullName: nextFullName,
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      });

      setToast({
        tone: 'success',
        message: 'Profil mis à jour avec succès',
      });
    } catch (error) {
      setToast({
        tone: 'error',
        message: getApiErrorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Paramètres"
        title="Profil"
        description="Gérez votre profil utilisateur et vos paramètres de sécurité."
      />

      {toast && (
        <Alert
          variant={toast.tone === 'success' ? 'success' : 'error'}
          title={toast.tone === 'success' ? 'Succès' : 'Erreur'}
          message={toast.message}
        />
      )}

      <SectionCard title="Informations Personnelles" description="Mettez à jour vos informations de profil.">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              <User size={14} className="mb-1 inline" /> Adresse email
            </label>
            <input
              type="email"
              value={user.email}
              disabled
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-secondary)]"
            />
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Adresse email non modifiable
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Nom complet
            </label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setField('fullName', e.target.value)}
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                errors.fullName
                  ? 'border-red-500/50 bg-red-500/5'
                  : 'border-[var(--border)] bg-[var(--bg-input)]'
              } text-[var(--text-primary)]`}
              placeholder="Votre nom complet"
            />
            {errors.fullName && <p className="mt-1 text-xs text-red-400">{errors.fullName}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              <Shield size={14} className="mb-1 inline" /> Rôle
            </label>
            <input
              type="text"
              value={user.role === 'ADMIN' ? 'Administrateur' : 'Développeur'}
              disabled
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-secondary)]"
            />
          </div>

          <Button
            type="submit"
            disabled={!canSubmit}
            icon={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          >
            {saving ? 'Mise à jour...' : 'Mettre à jour le profil'}
          </Button>
        </form>
      </SectionCard>

      <SectionCard title="Changer le mot de passe" description="Mettez à jour votre mot de passe de sécurité.">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Mot de passe actuel
            </label>
            <input
              type="password"
              value={form.currentPassword}
              onChange={(e) => setField('currentPassword', e.target.value)}
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                errors.currentPassword
                  ? 'border-red-500/50 bg-red-500/5'
                  : 'border-[var(--border)] bg-[var(--bg-input)]'
              } text-[var(--text-primary)]`}
              placeholder="Votre mot de passe actuel"
            />
            {errors.currentPassword && (
              <p className="mt-1 text-xs text-red-400">{errors.currentPassword}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Nouveau mot de passe
            </label>
            <input
              type="password"
              value={form.newPassword}
              onChange={(e) => setField('newPassword', e.target.value)}
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                errors.newPassword
                  ? 'border-red-500/50 bg-red-500/5'
                  : 'border-[var(--border)] bg-[var(--bg-input)]'
              } text-[var(--text-primary)]`}
              placeholder="Minimum 8 caractères"
            />
            {errors.newPassword && <p className="mt-1 text-xs text-red-400">{errors.newPassword}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)]">
              Confirmer le nouveau mot de passe
            </label>
            <input
              type="password"
              value={form.confirmNewPassword}
              onChange={(e) => setField('confirmNewPassword', e.target.value)}
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm ${
                errors.confirmNewPassword
                  ? 'border-red-500/50 bg-red-500/5'
                  : 'border-[var(--border)] bg-[var(--bg-input)]'
              } text-[var(--text-primary)]`}
              placeholder="Confirmez votre nouveau mot de passe"
            />
            {errors.confirmNewPassword && (
              <p className="mt-1 text-xs text-red-400">{errors.confirmNewPassword}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={!canSubmit}
            icon={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          >
            {saving ? 'Mise à jour...' : 'Changer le mot de passe'}
          </Button>
        </form>
      </SectionCard>
    </div>
  );
}
