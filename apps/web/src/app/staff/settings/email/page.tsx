"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Mail, Send, ShieldAlert } from "lucide-react";
import {
  staffService,
  type SmtpSecurityMode,
  type UpdateStaffEmailSettings,
} from "@/features/staff/api/staff.service";
import { useStaffAuth } from "@/features/staff/api/use-staff-auth";
import { getApiErrorMessage } from "@/shared/lib/api";

type EmailForm = UpdateStaffEmailSettings & { password: string };

const EMPTY_FORM: EmailForm = {
  enabled: false,
  host: "",
  port: 587,
  security: "starttls",
  user: "",
  password: "",
  clearPassword: false,
  from: "",
  to: "",
};

const fieldClass =
  "w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50";

export default function StaffEmailSettingsPage() {
  const { staff } = useStaffAuth();
  const queryClient = useQueryClient();
  const canEdit = staff?.role === "ROOT";
  const [form, setForm] = useState<EmailForm>(EMPTY_FORM);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["staff-email-settings"],
    queryFn: staffService.getEmailSettings,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: data.enabled,
      host: data.host,
      port: data.port,
      security: data.security,
      user: data.user,
      password: "",
      clearPassword: false,
      from: data.from,
      to: data.to,
    });
  }, [data]);

  const isDirty = useMemo(() => {
    if (!data) return false;
    return (
      form.enabled !== data.enabled ||
      form.host !== data.host ||
      form.port !== data.port ||
      form.security !== data.security ||
      (form.user ?? "") !== data.user ||
      Boolean(form.password) ||
      Boolean(form.clearPassword) ||
      form.from !== data.from ||
      (form.to ?? "") !== data.to
    );
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: staffService.updateEmailSettings,
    onSuccess: (saved) => {
      queryClient.setQueryData(["staff-email-settings"], saved);
      setMessage({
        kind: "success",
        text: "Configuration enregistrée. Le mot de passe reste chiffré et n’est jamais renvoyé au navigateur.",
      });
    },
    onError: (mutationError) => {
      setMessage({ kind: "error", text: getApiErrorMessage(mutationError) });
    },
  });

  const testMutation = useMutation({
    mutationFn: staffService.testEmailSettings,
    onSuccess: ({ recipient }) => {
      setMessage({
        kind: "success",
        text: `Connexion validée et email de test envoyé à ${recipient}.`,
      });
    },
    onError: (mutationError) => {
      setMessage({ kind: "error", text: getApiErrorMessage(mutationError) });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (!canEdit) return;
    saveMutation.mutate({
      ...form,
      host: form.host.trim(),
      user: form.user?.trim(),
      password: form.password || undefined,
      from: form.from.trim(),
      to: form.to?.trim(),
    });
  };

  if (isLoading) {
    return <p className="text-sm text-zinc-400">Chargement…</p>;
  }

  if (error || !data) {
    return (
      <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
        {getApiErrorMessage(error)}
      </p>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
          <Mail size={18} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white">Configuration email</h1>
          <p className="text-sm text-zinc-400">
            Paramètres SMTP globaux pour les validations, invitations et
            alertes.
          </p>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatusCard label="Source active" value={data.source} />
        <StatusCard
          label="Service"
          value={data.enabled ? "Activé" : "Désactivé"}
        />
        <StatusCard
          label="Secret SMTP"
          value={data.passwordConfigured ? "Configuré" : "Non configuré"}
        />
      </div>

      {data.source === "environment" && canEdit ? (
        <div className="mb-5 flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
          <ShieldAlert className="mt-0.5 shrink-0" size={18} />
          <p>
            La configuration actuelle vient de l’environnement. Le premier
            enregistrement depuis cette page crée une configuration complète en
            base. Si un utilisateur SMTP est renseigné, saisissez aussi son mot
            de passe afin d’éviter une configuration partielle.
          </p>
        </div>
      ) : null}

      <form
        onSubmit={submit}
        className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6"
      >
        <label className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-zinc-900/60 p-4">
          <span>
            <span className="block text-sm font-semibold text-white">
              Activer l’envoi d’emails
            </span>
            <span className="mt-1 block text-xs text-zinc-400">
              Les parcours transactionnels échouent explicitement si le service
              est désactivé.
            </span>
          </span>
          <input
            type="checkbox"
            checked={form.enabled}
            disabled={!canEdit}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                enabled: event.target.checked,
              }))
            }
            className="h-5 w-5 accent-blue-500"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Serveur SMTP" className="md:col-span-2">
            <input
              required={form.enabled}
              value={form.host}
              disabled={!canEdit}
              placeholder="smtp.provider.example"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  host: event.target.value,
                }))
              }
              className={fieldClass}
            />
          </Field>
          <Field label="Port">
            <input
              required
              type="number"
              min={1}
              max={65535}
              value={form.port}
              disabled={!canEdit}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  port: Number(event.target.value),
                }))
              }
              className={fieldClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Sécurité de transport">
            <select
              value={form.security}
              disabled={!canEdit}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  security: event.target.value as SmtpSecurityMode,
                }))
              }
              className={fieldClass}
            >
              <option value="starttls">STARTTLS — recommandé (587)</option>
              <option value="tls">TLS implicite (465)</option>
              <option value="none">Sans TLS — développement local</option>
            </select>
          </Field>
          <Field label="Utilisateur SMTP">
            <input
              autoComplete="off"
              value={form.user}
              disabled={!canEdit}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  user: event.target.value,
                }))
              }
              className={fieldClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Nouveau mot de passe SMTP"
            hint="Laissez vide pour conserver le secret actuel. Il ne peut jamais être relu."
          >
            <input
              type="password"
              autoComplete="new-password"
              value={form.password}
              disabled={!canEdit || Boolean(form.clearPassword)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              className={fieldClass}
            />
          </Field>
          <Field label="Expéditeur">
            <input
              type="email"
              required={form.enabled}
              value={form.from}
              disabled={!canEdit}
              placeholder="contact@sovrack.tech"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
              className={fieldClass}
            />
          </Field>
        </div>

        {data.passwordConfigured && canEdit ? (
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={Boolean(form.clearPassword)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  password: "",
                  clearPassword: event.target.checked,
                }))
              }
              className="accent-red-500"
            />
            Supprimer le secret SMTP enregistré
          </label>
        ) : null}

        <Field
          label="Destinataire des alertes opérationnelles"
          hint="La vérification de compte et la réinitialisation utilisent toujours l’adresse du client concerné."
        >
          <input
            type="email"
            value={form.to}
            disabled={!canEdit}
            placeholder="contact@sovrack.tech"
            onChange={(event) =>
              setForm((current) => ({ ...current, to: event.target.value }))
            }
            className={fieldClass}
          />
        </Field>

        {message ? (
          <p
            className={`rounded-xl border p-3 text-sm ${
              message.kind === "success"
                ? "border-green-500/20 bg-green-500/10 text-green-300"
                : "border-red-500/20 bg-red-500/10 text-red-300"
            }`}
          >
            {message.text}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
          {canEdit ? (
            <button
              type="submit"
              disabled={!isDirty || saveMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCircle2 size={16} />
              {saveMutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          ) : (
            <p className="text-xs text-zinc-500">
              Un ADMIN peut consulter et tester. Seul ROOT peut modifier.
            </p>
          )}
          <button
            type="button"
            disabled={!data.enabled || isDirty || testMutation.isPending}
            onClick={() => {
              setMessage(null);
              testMutation.mutate();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={16} />
            {testMutation.isPending
              ? "Test en cours…"
              : "Tester vers mon adresse"}
          </button>
          {isDirty ? (
            <span className="text-xs text-amber-300">
              Enregistrez les changements avant de tester.
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1.5 block text-xs text-zinc-500">{hint}</span>
      ) : null}
    </label>
  );
}
