'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { usersService } from '@/services/users.service';
import { getApiErrorMessage } from '@/lib/api';

const createUserSchema = z.object({
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
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  role: z.enum(['ADMIN', 'DEVELOPER']),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof createUserSchema>;
type FormErrors = Partial<Record<keyof FormData, string>>;
type ToastTone = 'success' | 'error';

type ToastState = {
  message: string;
  tone: ToastTone;
} | null;

const DEFAULT_FORM: FormData = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  role: 'DEVELOPER',
  isActive: true,
};

export default function NewUserPage() {
  const router = useRouter();

  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

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

    const parsed = createUserSchema.safeParse(form);
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

    setSubmitting(true);
    try {
      const created = await usersService.create({
        fullName: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
        email: parsed.data.email,
        password: parsed.data.password,
        role: parsed.data.role,
      });

      if (!parsed.data.isActive) {
        await usersService.toggleActive(created.id);
      }

      setToast({
        message: 'Utilisateur créé avec succès',
        tone: 'success',
      });

      window.setTimeout(() => {
        router.push('/admin/users');
      }, 500);
    } catch (createError) {
      setToast({
        message: getApiErrorMessage(createError),
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Créer un utilisateur"
        description="Ajoutez un nouveau compte admin ou développeur."
        actions={
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700"
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
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      <SectionCard title="User details" contentClassName="p-6">
        <form onSubmit={handleSubmit} className="space-y-0">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Prénom
            </label>
            <input
              value={form.firstName}
              onChange={(event) => setField('firstName', event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
              placeholder="John"
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
              placeholder="Developer"
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
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
              placeholder="dev@devops.com"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Mot de passe
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setField('password', event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
              placeholder="Minimum 8 caractères"
            />
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
              <span className="text-sm text-slate-700">Actif par défaut</span>
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
            disabled={submitting || !canSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            Créer
          </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
