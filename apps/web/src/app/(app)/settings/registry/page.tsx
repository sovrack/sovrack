"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { Alert } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { useAuth } from "@/features/auth/api/use-auth";
import { getApiErrorMessage } from "@/shared/lib/api";
import { useToasts } from "@/shared/hooks/use-toasts";
import { platformConfigService } from "@/features/platform/api/platform-config.service";
import type {
  CreateRegistryConfigPayload,
  RegistryConfig,
  RegistryProviderType,
  UpdateRegistryConfigPayload,
} from "@/features/platform/types/platform-config";
import {
  RegistryForm,
  REGISTRY_TYPE_LABELS,
  type DialogMode,
  type RegistryFormState,
} from "@/features/platform/components/registry-form";

function RegistryLogo({ type }: { type: RegistryProviderType }) {
  if (type === "DOCKER_HUB") {
    return (
      <svg viewBox="0 0 64 64" className="h-5 w-5" fill="none" aria-hidden>
        <path
          d="M32 4C17.66 4 6 15.66 6 30c0 14.34 11.66 26 26 26s26-11.66 26-26c0-14.34-11.66-26-26-26z"
          fill="#0092e6"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 64 64"
      className="h-5 w-5"
      fill="currentColor"
      aria-hidden
    >
      <path d="M32 4C17.66 4 6 15.66 6 30c0 14.34 11.66 26 26 26s26-11.66 26-26c0-14.34-11.66-26-26-26z" />
    </svg>
  );
}

function ConnectionStatusBadge({
  isConnected,
  error,
}: {
  isConnected: boolean;
  error: string | null;
}) {
  if (isConnected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400">
        <CheckCircle2 size={12} />
        Connectedd
      </span>
    );
  }

  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
        <XCircle size={12} />
        Not connected
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
      <AlertCircle size={12} />
      Not tested
    </span>
  );
}

export default function RegistrySettingsPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { toasts, showToast: addToast } = useToasts(5000);
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [selectedRegistry, setSelectedRegistry] =
    useState<RegistryConfig | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  const {
    data: registries = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ["registry-configs"],
    queryFn: () => platformConfigService.listRegistryConfigs(),
    enabled: isAdmin,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const error = queryError ? getApiErrorMessage(queryError) : null;
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["registry-configs"] }),
    [queryClient],
  );

  const formData = useMemo(() => {
    if (!selectedRegistry) {
      return undefined;
    }

    return {
      id: selectedRegistry.id,
      name: selectedRegistry.name,
      type: selectedRegistry.type,
      username: selectedRegistry.username,
      password: "",
      registryUrl: selectedRegistry.registryUrl,
      isDefault: selectedRegistry.isDefault,
    } satisfies RegistryFormState;
  }, [selectedRegistry]);

  const handleFormSubmit = useCallback(
    async (data: RegistryFormState) => {
      setIsSubmitting(true);

      try {
        if (dialogMode === "create") {
          const payload: CreateRegistryConfigPayload = {
            name: data.name.trim(),
            type: data.type,
            isDefault: data.isDefault,
            ...(data.username.trim() ? { username: data.username.trim() } : {}),
            ...(data.password.trim() ? { password: data.password.trim() } : {}),
            ...(data.registryUrl.trim()
              ? { registryUrl: data.registryUrl.trim() }
              : {}),
          };

          await platformConfigService.createRegistryConfig(payload);
          addToast("Registry created avec succes.", "success");
        }

        if (dialogMode === "edit" && data.id) {
          const payload: UpdateRegistryConfigPayload = {
            name: data.name.trim(),
            type: data.type,
            isDefault: data.isDefault,
            ...(data.username.trim()
              ? { username: data.username.trim() }
              : { username: "" }),
            ...(data.password.trim() ? { password: data.password.trim() } : {}),
            ...(data.registryUrl.trim()
              ? { registryUrl: data.registryUrl.trim() }
              : { registryUrl: "" }),
          };

          await platformConfigService.updateRegistryConfig(data.id, payload);
          addToast("Registry updated avec succes.", "success");
        }

        setDialogMode(null);
        setSelectedRegistry(null);
        await invalidate();
      } catch (submitError) {
        addToast(getApiErrorMessage(submitError), "error");
      } finally {
        setIsSubmitting(false);
      }
    },
    [addToast, dialogMode, invalidate],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteId) {
      return;
    }

    try {
      await platformConfigService.deleteRegistryConfig(deleteId);
      addToast("Registry deleted avec succes.", "success");
      setDeleteId(null);
      await invalidate();
    } catch (deleteError) {
      addToast(getApiErrorMessage(deleteError), "error");
    }
  }, [addToast, deleteId, invalidate]);

  const handleTest = useCallback(
    async (id: string) => {
      setTestingId(id);

      try {
        const result = await platformConfigService.testRegistryConnection(id);
        addToast(result.message, result.ok ? "success" : "error");
        await invalidate();
      } catch (testError) {
        addToast(getApiErrorMessage(testError), "error");
      } finally {
        setTestingId(null);
      }
    },
    [addToast, invalidate],
  );

  const handleSetDefault = useCallback(
    async (id: string) => {
      setSettingDefaultId(id);

      try {
        await platformConfigService.setDefaultRegistryConfig(id);
        addToast("Default registry defini.", "success");
        await invalidate();
      } catch (setDefaultError) {
        addToast(getApiErrorMessage(setDefaultError), "error");
      } finally {
        setSettingDefaultId(null);
      }
    },
    [addToast, invalidate],
  );

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Registries"
          description="This section is restricted to administrators."
        />
        <Alert tone="warning" title="Restricted access">
          You do not have permission to access the registry configuration.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configuration"
        title="Registries"
        description="Manage your container registries (Docker Hub, ECR, GCR, etc.)."
        actions={
          dialogMode === null ? (
            <Button
              icon={<Plus size={14} />}
              onClick={() => setDialogMode("create")}
            >
              Add registry
            </Button>
          ) : null
        }
      />

      {error && (
        <Alert tone="error" title="Error">
          {error}
        </Alert>
      )}

      <div className="space-y-3">
        {toasts.map((toast) => (
          <Alert
            key={toast.id}
            tone={toast.tone === "success" ? "success" : "error"}
            title={toast.tone === "success" ? "Success" : "Error"}
          >
            {toast.message}
          </Alert>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2
            size={24}
            className="animate-spin text-[var(--text-secondary)]"
          />
        </div>
      )}

      {!loading && registries.length === 0 && dialogMode === null && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
          <p className="mb-4 text-[var(--text-secondary)]">
            No registry configured
          </p>
          <Button
            icon={<Plus size={14} />}
            onClick={() => setDialogMode("create")}
          >
            Add registry
          </Button>
        </div>
      )}

      {dialogMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (isSubmitting) return;
              setDialogMode(null);
              setSelectedRegistry(null);
            }}
            aria-hidden
          />
          <div className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-6 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                  Settings
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                  {dialogMode === "create" ? "Add registry" : "Edit registry"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isSubmitting) return;
                  setDialogMode(null);
                  setSelectedRegistry(null);
                }}
                className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-4">
              <RegistryForm
                initialData={formData}
                mode={dialogMode}
                onSubmit={handleFormSubmit}
                onCancel={() => {
                  setDialogMode(null);
                  setSelectedRegistry(null);
                }}
                isSubmitting={isSubmitting}
                withTopDivider={false}
              />
            </div>
          </div>
        </div>
      )}

      {!loading && registries.length > 0 && dialogMode === null && (
        <div className="grid gap-4">
          {registries.map((registry) => (
            <div
              key={registry.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-[var(--bg-secondary)] p-2">
                    <RegistryLogo type={registry.type} />
                  </div>

                  <div>
                    <h4 className="font-semibold text-[var(--text-primary)]">
                      {registry.name}
                    </h4>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {REGISTRY_TYPE_LABELS[registry.type]}
                      {registry.isDefault && (
                        <span className="ml-2 inline-block rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
                          Par defaut
                        </span>
                      )}
                    </p>
                    {registry.registryUrl && (
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        URL: {registry.registryUrl}
                      </p>
                    )}
                  </div>
                </div>

                <ConnectionStatusBadge
                  isConnected={registry.isConnected}
                  error={registry.connectionError}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Pencil size={12} />}
                  onClick={() => {
                    setSelectedRegistry(registry);
                    setDialogMode("edit");
                  }}
                >
                  Edit
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  loading={testingId === registry.id}
                  onClick={() => void handleTest(registry.id)}
                >
                  Test
                </Button>

                {!registry.isDefault && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={settingDefaultId === registry.id}
                    onClick={() => void handleSetDefault(registry.id)}
                  >
                    Set default
                  </Button>
                )}

                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Trash2 size={12} />}
                  onClick={() => setDeleteId(registry.id)}
                >
                  Delete
                </Button>
              </div>

              {registry.connectionError && (
                <div className="mt-3 rounded-md bg-red-500/10 p-3 text-sm text-red-400">
                  <strong>Connection error:</strong> {registry.connectionError}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete le registre"
        description="This action cannot be undone et supprime la configuration du registre."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
