"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Loader2, Save } from "lucide-react";
import { Alert } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { getApiErrorMessage } from "@/shared/lib/api";
import { teamsService } from "@/features/teams/api/teams.service";
import type { Team } from "@/features/teams/types/team";

const createTeamSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
});

type FormData = z.infer<typeof createTeamSchema>;
type FormErrors = Partial<Record<keyof FormData, string>>;

type TeamCreateDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (team: Team) => Promise<void> | void;
};

const DEFAULT_FORM: FormData = {
  name: "",
  description: "",
};

export function TeamCreateDialog({
  open,
  onClose,
  onCreated,
}: TeamCreateDialogProps) {
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setForm(DEFAULT_FORM);
    setErrors({});
    setError(null);
    setSubmitting(false);
  }, [open]);

  const canSubmit = useMemo(() => form.name.trim().length > 0, [form.name]);

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = createTeamSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !nextErrors[field as keyof FormData]) {
          nextErrors[field as keyof FormData] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const created = await teamsService.create({
        name: parsed.data.name,
        description: parsed.data.description || undefined,
      });
      await onCreated?.(created);
      onClose();
    } catch (createError) {
      setError(getApiErrorMessage(createError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!submitting}
      size="lg"
      title="Créer une organisation"
      description="Une organisation permet d’inviter des membres et de répartir les rôles."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            type="submit"
            form="team-create-form"
            disabled={submitting || !canSubmit}
          >
            {submitting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            Créer
          </Button>
        </>
      }
    >
      <form id="team-create-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-secondary">
            Nom de l&apos;organisation <span className="text-red-400">*</span>
          </label>
          <input
            value={form.name}
            onChange={(event) => setField("name", event.target.value)}
            placeholder="Acme Engineering"
            className="h-11 w-full rounded-lg border border-border bg-card px-4 text-sm text-primary outline-none transition placeholder:text-secondary focus:ring-2 focus:ring-accent/20"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600">{errors.name}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-secondary">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(event) => setField("description", event.target.value)}
            placeholder="Description facultative…"
            rows={4}
            className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-primary outline-none transition placeholder:text-secondary focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </form>
    </Modal>
  );
}
