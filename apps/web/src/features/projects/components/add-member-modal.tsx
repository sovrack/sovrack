"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Modal } from "@/shared/ui/modal";
import { Button } from "@/shared/ui/button";
import type { ProjectRole } from "@/features/projects/types/project";

type AddMemberModalProps = {
  open: boolean;
  onClose: () => void;
  onAdd: (email: string, role: ProjectRole) => Promise<void>;
};

export function AddMemberModal({ open, onClose, onAdd }: AddMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("DEVELOPER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onAdd(email.trim(), role);
      setEmail("");
      setRole("DEVELOPER");
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!loading}
      title="Add Member"
      icon={
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--text-primary)]/15">
          <UserPlus size={16} className="text-[var(--text-secondary)]" />
        </div>
      }
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-member-form"
            size="sm"
            loading={loading}
            disabled={!email.trim()}
          >
            Add Member
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <form id="add-member-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="add-member-email"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]"
          >
            Email <span className="text-red-400">*</span>
          </label>
          <input
            id="add-member-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="developer@example.com"
            required
            autoFocus
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:bg-[var(--bg-card)]/10 focus:ring-2 focus:ring-zinc-500/20"
          />
        </div>

        <div>
          <label
            htmlFor="add-member-role"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]"
          >
            Role
          </label>
          <select
            id="add-member-role"
            value={role}
            onChange={(e) => setRole(e.target.value as ProjectRole)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:bg-[var(--bg-card)]/10 focus:ring-2 focus:ring-zinc-500/20"
          >
            <option value="DEVELOPER">Developer — Can deploy</option>
            <option value="VIEWER">Viewer — Read only</option>
            <option value="OWNER">Owner — Full project access</option>
          </select>
        </div>
      </form>
    </Modal>
  );
}
