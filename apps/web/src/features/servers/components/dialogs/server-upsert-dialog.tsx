"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Alert } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { Input } from "@/shared/ui/input";
import { sshKeysService } from "@/features/ssh-keys";
import type { SshKey } from "@/features/ssh-keys";
import type {
  CreateServerPayload,
  Server,
  UpdateServerPayload,
} from "@/features/servers/types/server";
import {
  validateServerForm,
  buildCreatePayload,
  buildUpdatePayload,
  createDefaultValues,
  createValuesFromServer,
  type ServerFormValues,
  type ServerFormErrors,
} from "../forms/server-form.validation";

type DialogMode = "create" | "edit";

export type CreateServerOptions = {
  temporaryPassword?: string;
};

type ServerUpsertDialogProps = {
  open: boolean;
  mode: DialogMode;
  server?: Server | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (
    payload: CreateServerPayload,
    options?: CreateServerOptions,
  ) => Promise<void>;
  onUpdate: (serverId: string, payload: UpdateServerPayload) => Promise<void>;
};

export function ServerUpsertDialog({
  open,
  mode,
  server,
  loading,
  error,
  onClose,
  onCreate,
  onUpdate,
}: ServerUpsertDialogProps) {
  const initialValues = useMemo(() => {
    if (mode === "edit" && server) return createValuesFromServer(server);
    return createDefaultValues();
  }, [mode, server]);

  const [values, setValues] = useState<ServerFormValues>(initialValues);
  const [formErrors, setFormErrors] = useState<ServerFormErrors>({});
  const [sshKeys, setSshKeys] = useState<SshKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues(initialValues);
    setFormErrors({});
    setTemporaryPassword("");

    // Loaded in both modes now (A1): edit mode also offers switching this
    // server to a different existing SSH key, not just at creation time.
    // Only loaded in create mode — editing the SSH key from this general
    // "Edit" dialog is deliberately not offered (a wrong key silently breaks
    // connectivity); rotating credentials is a separate, more careful flow.
    if (mode !== "create") return;
    setKeysLoading(true);
    sshKeysService
      .getAll()
      .then((keys) => {
        setSshKeys(keys);
      })
      .catch(() => {
        setSshKeys([]);
      })
      .finally(() => {
        setKeysLoading(false);
      });
  }, [initialValues, open, mode]);

  const set = <K extends keyof ServerFormValues>(
    key: K,
    value: ServerFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => ({ ...prev, [key]: undefined, form: undefined }));
  };

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    const { errors, parsed } = validateServerForm(mode, values);
    if (!parsed) {
      setFormErrors(errors);
      return;
    }

    try {
      if (mode === "create") {
        await onCreate(buildCreatePayload(parsed), {
          temporaryPassword: temporaryPassword.trim() || undefined,
        });
        return;
      }

      if (!server) {
        setFormErrors({ form: "Unable to update this server." });
        return;
      }

      const updatePayload = buildUpdatePayload(parsed, server);
      if (Object.keys(updatePayload).length === 0) {
        setFormErrors({ form: "No changes detected." });
        return;
      }

      await onUpdate(server.id, updatePayload);
    } catch {}
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!loading}
      size="xl"
      title={mode === "create" ? "Add Server" : "Edit Server"}
      description={
        mode === "create"
          ? "Configure SSH connection to your VPS."
          : "Update server connection settings and credentials safely."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" form="server-upsert-form" loading={loading}>
            {mode === "create" ? "Create server" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id="server-upsert-form" onSubmit={handleSubmit}>
        <div className="space-y-4">
          {(error || formErrors.form) && (
            <Alert tone="error">{formErrors.form ?? error}</Alert>
          )}

          {mode === "create" && (
            <Alert tone="warning">
              Enter a temporary VPS password if you want automatic key
              installation right after creation.
            </Alert>
          )}

          {/* SSH Key selector — create mode only. Editing (rotating) the key
              from this general "Edit" dialog is deliberately not offered: a
              wrong selection silently breaks connectivity with no warning
              until the next deploy. */}
          {mode === "create" && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                SSH Key <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <select
                  value={values.sshKeyId}
                  onChange={(e) => set("sshKeyId", e.target.value)}
                  disabled={keysLoading}
                  className="h-11 w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 pr-10 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-50"
                >
                  <option value="">
                    {keysLoading ? "Loading SSH keys…" : "— Select a SSH key —"}
                  </option>
                  {sshKeys.map((key) => (
                    <option key={key.id} value={key.id}>
                      {key.name} ({key.keyType.toUpperCase()})
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                />
              </div>
              {formErrors.sshKeyId && (
                <p className="text-xs text-red-400">{formErrors.sshKeyId}</p>
              )}
              {sshKeys.length === 0 && !keysLoading && (
                <p className="text-xs text-[var(--text-secondary)]">
                  No SSH keys found. Go to{" "}
                  <a
                    href="/settings/ssh-keys"
                    className="underline hover:text-[var(--text-primary)]"
                  >
                    Settings › SSH Keys
                  </a>{" "}
                  to create one first.
                </p>
              )}
            </div>
          )}

          {/* Main fields */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Server name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="VPS Production"
              error={formErrors.name}
            />
            <Input
              label="Host or IP"
              value={values.host}
              onChange={(e) => set("host", e.target.value)}
              placeholder="192.168.1.10"
              error={formErrors.host}
            />
            <Input
              label="SSH port"
              type="number"
              min={1}
              max={65535}
              value={values.port}
              onChange={(e) => set("port", e.target.value)}
              error={formErrors.port}
            />
            <Input
              label="SSH username"
              value={values.username}
              onChange={(e) => set("username", e.target.value)}
              placeholder="ubuntu"
              hint='Use "root" or a non-root user with passwordless sudo access.'
              error={formErrors.username}
            />
            {mode === "create" && (
              <Input
                type="password"
                label="Temporary VPS password (optional)"
                value={temporaryPassword}
                onChange={(e) => setTemporaryPassword(e.target.value)}
                placeholder="Used once to install SSH public key"
                autoComplete="new-password"
                hint="Recommended for first setup. You can also leave it empty and install key manually after create."
              />
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
