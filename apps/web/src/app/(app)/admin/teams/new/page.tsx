'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { teamsService } from '@/services/teams.service';
import { getApiErrorMessage } from '@/lib/api';

const createTeamSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire"),
  description: z.string().trim().optional(),
});

type FormData = z.infer<typeof createTeamSchema>;
type FormErrors = Partial<Record<keyof FormData, string>>;
type ToastState = { message: string; tone: 'success' | 'error' } | null;

const DEFAULT_FORM: FormData = { name: '', description: '' };

export default function NewTeamPage() {
  const router = useRouter();

  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const canSubmit = useMemo(() => form.name.trim().length > 0, [form.name]);

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setToast(null);

    const parsed = createTeamSchema.safeParse(form);
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
      await teamsService.create({
        name: parsed.data.name,
        description: parsed.data.description || undefined,
      });

      setToast({ message: 'Équipe créée avec succès', tone: 'success' });
      window.setTimeout(() => router.push('/admin/teams'), 500);
    } catch (err) {
      setToast({ message: getApiErrorMessage(err), tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/teams"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700"
        >
          <ArrowLeft size={15} />
          Retour à la liste
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-900">
          Créer une équipe
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Donnez un nom à votre nouvelle équipe.
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
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Nom de l&apos;équipe <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="Frontend Team"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name}</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Description optionnelle de l'équipe..."
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Link
            href="/admin/teams"
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
    </div>
  );
}
