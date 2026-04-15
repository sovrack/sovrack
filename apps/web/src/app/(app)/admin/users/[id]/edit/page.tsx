'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { usersService } from '@/services/users.service';
import { getApiErrorMessage } from '@/lib/api';

const editUserSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'Le prénom est obligatoire'),
  lastName: z
    .string()
    .trim()
    .min(1, 'Le nom est obligatoire'),
  email: z
    .string()
    .trim()
    .min(1, 'L’email est obligatoire')
    .email('Email invalide'),
  password: z
    .string()
    .refine(
      (value) => value.length === 0 || value.length >= 8,
      'Le mot de passe doit contenir au moins 8 caractères',
    ),
  role: z.enum(['ADMIN', 'DEVELOPER']),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof editUserSchema>;
type FormErrors = Partial<Record<keyof FormData, string>>;
type Props = { params: Promise<{ id: string }> };
type ToastTone = 'success' | 'error';

type ToastState = {
  message: string;
  tone: ToastTone;
} | null;

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const normalized = fullName.trim();
  if (!normalized) {
    return { firstName: '', lastName: '' };
  }

  const [firstName, ...rest] = normalized.split(/\s+/);
  return {
    firstName,
    lastName: rest.join(' '),
  };
}

export default function EditUserPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [form, setForm] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'DEVELOPER',
    isActive: true,
  });

  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true);
      setToast(null);
      try {
        const user = await usersService.getById(id);
        const { firstName, lastName } = splitFullName(user.fullName);
        setForm({
          firstName,
          lastName,
          email: user.email,
          password: '',
          role: user.role,
          isActive: user.isActive,
        });
      } catch (fetchError) {
        setToast({
          message: getApiErrorMessage(fetchError),
          tone: 'error',
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchUser();
  }, [id]);

  const canSubmit = useMemo(
    () => form.firstName.trim() && form.lastName.trim() && form.email.trim(),
    [form.firstName, form.lastName, form.email],
  );

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setToast(null);

    const parsed = editUserSchema.safeParse(form);
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
      await usersService.update(id, {
        fullName: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
        role: parsed.data.role,
        isActive: parsed.data.isActive,
      });

      setToast({
        message:
          parsed.data.password.trim().length > 0
            ? 'Profil mis à jour. Le changement de mot de passe sera disponible dans une API dédiée.'
            : 'Utilisateur modifié avec succès',
        tone: 'success',
      });

      window.setTimeout(() => {
        router.push('/admin/users');
      }, 550);
    } catch (updateError) {
      setToast({
        message: getApiErrorMessage(updateError),
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
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
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700"
        >
          <ArrowLeft size={15} />
          Retour à la liste
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-900">
          Modifier l’utilisateur
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Mettez à jour le profil, le rôle et l’état d’activation.
        </p>
      </div>

      {toast && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium ${
            toast.tone === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-theme-xs"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Prénom
            </label>
            <input
              value={form.firstName}
              onChange={(event) => setField('firstName', event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
            {errors.firstName && (
              <p className="mt-1 text-xs text-red-600">{errors.firstName}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Nom
            </label>
            <input
              value={form.lastName}
              onChange={(event) => setField('lastName', event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
            {errors.lastName && (
              <p className="mt-1 text-xs text-red-600">{errors.lastName}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setField('email', event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 text-sm text-slate-700 outline-none"
              disabled
            />
            <p className="mt-1 text-xs text-slate-400">
              L’email est affiché en lecture seule.
            </p>
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Mot de passe (optionnel)
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setField('password', event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
              placeholder="Laisser vide pour ne pas changer"
            />
            <p className="mt-1 text-xs text-slate-400">
              Le backend actuel ne fournit pas encore de route de mise à jour du mot
              de passe.
            </p>
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Rôle
            </label>
            <select
              value={form.role}
              onChange={(event) =>
                setField('role', event.target.value as FormData['role'])
              }
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
            >
              <option value="DEVELOPER">DEVELOPER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setField('isActive', event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
              />
              <span className="text-sm text-slate-700">Compte actif</span>
            </label>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Link
            href="/admin/users"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
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
    </div>
  );
}
