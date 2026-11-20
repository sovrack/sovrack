"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type {
  CreateGitlabProviderPayload,
  GitlabProvider,
  UpdateGitlabProviderPayload,
} from "@/features/platform";
import { PROVIDER_META, type ProviderType } from "./provider-meta";
import { ProviderCredentialsStep } from "./provider-credentials-step";
import { StepIndicator, type AuthChoice } from "./provider-form-fields";
import {
  ProviderTypeStep,
  InstanceConfigStep,
  AuthMethodStep,
} from "./add-provider-dialog.steps";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type DialogMode = "create" | "edit";

export type ProviderFormData = {
  // Step 2 — Instance
  name: string;
  providerUrl: string;
  internalUrl: string;
  isDefault: boolean;
  // Step 4 — OAuth
  applicationId: string;
  applicationSecret: string;
  redirectUri: string;
  groupNames: string;
  // Step 5 — PAT
  adminToken: string;
  // State from existing record
  applicationSecretConfigured: boolean;
  adminTokenConfigured: boolean;
  oauthTokenConfigured: boolean;
  oauthExpiresAt: string | null;
};

export type AddProviderDialogProps = {
  open: boolean;
  mode: DialogMode;
  existingProvider?: GitlabProvider | null;
  initialProviderType?: "GITLAB" | "GITHUB";
  fallbackRedirectUri: string;
  saving: boolean;
  error: string | null;
  copiedRedirect: boolean;
  onSave: (
    payload: CreateGitlabProviderPayload | UpdateGitlabProviderPayload,
    providerType?: "GITLAB" | "GITHUB",
  ) => Promise<void>;
  onClose: () => void;
  onCopyRedirectUri: (value: string) => void;
};

/* ─── Dialog ─────────────────────────────────────────────────────────────── */

export function AddProviderDialog({
  open,
  mode,
  existingProvider,
  initialProviderType = "GITLAB",
  fallbackRedirectUri,
  saving,
  error,
  copiedRedirect,
  onSave,
  onClose,
  onCopyRedirectUri,
}: AddProviderDialogProps) {
  const isEdit = mode === "edit";

  // In edit mode we skip step 1 (provider type already known)
  const [step, setStep] = useState(isEdit ? 2 : 1);
  const [selectedType, setSelectedType] =
    useState<ProviderType>(initialProviderType);
  const [authChoice, setAuthChoice] = useState<AuthChoice>("pat");

  const [form, setForm] = useState<ProviderFormData>({
    name: "",
    providerUrl: "https://gitlab.com",
    internalUrl: "",
    isDefault: false,
    applicationId: "",
    applicationSecret: "",
    redirectUri: "",
    groupNames: "",
    adminToken: "",
    applicationSecretConfigured: false,
    adminTokenConfigured: false,
    oauthTokenConfigured: false,
    oauthExpiresAt: null,
  });

  // Set default URL when provider type changes in create mode
  useEffect(() => {
    if (!isEdit && step === 1) {
      const defaultUrl =
        selectedType === "GITHUB" ? "https://github.com" : "https://gitlab.com";
      setForm((prev) => ({ ...prev, providerUrl: defaultUrl }));
    }
  }, [selectedType, isEdit, step]);

  // GitHub has no OAuth callback route yet (see AuthMethodStep) — force the
  // choice down to "pat" whenever the user switches TO GitHub on step 1
  // during create mode. Edit mode's own inference (below) handles GitHub
  // directly instead of relying on this effect to clean up after it: two
  // effects independently calling setAuthChoice on the same mount raced
  // (the inference effect's unconditional setAuthChoice ran after this one
  // and overwrote its correction), so GitHub-awareness has to live in the
  // inference itself, not bolted on separately.
  useEffect(() => {
    if (!isEdit && selectedType === "GITHUB" && authChoice !== "pat") {
      setAuthChoice("pat");
    }
  }, [isEdit, selectedType, authChoice]);

  // Populate form when editing
  useEffect(() => {
    if (isEdit && existingProvider) {
      // Pre-existing gap this fix depends on: selectedType only had a useState
      // initial value (never re-synced), so re-opening this same dialog
      // instance for a DIFFERENT provider kept showing the PREVIOUS one's
      // type — which would have made the GitHub-OAuth-disable logic below
      // unreliable across a multi-edit session. Re-sync it explicitly here,
      // in the same effect that already re-syncs everything else per open.
      const isGithub = existingProvider.providerType === "GITHUB";
      setSelectedType(isGithub ? "GITHUB" : "GITLAB");
      setForm({
        name: existingProvider.name,
        providerUrl: existingProvider.providerUrl,
        internalUrl: existingProvider.internalUrl,
        isDefault: existingProvider.isDefault,
        applicationId: existingProvider.applicationId,
        applicationSecret: "",
        redirectUri: existingProvider.redirectUri || fallbackRedirectUri,
        groupNames: existingProvider.groupNames,
        adminToken: "",
        applicationSecretConfigured:
          existingProvider.applicationSecretConfigured,
        adminTokenConfigured: existingProvider.adminTokenConfigured,
        oauthTokenConfigured: existingProvider.oauthTokenConfigured,
        oauthExpiresAt: existingProvider.oauthExpiresAt,
      });
      // Infer authChoice from existing config. GitHub is PAT-only regardless
      // of any applicationId/secret saved before this fix (AUDIT_VERIFICATION_UI.md
      // Point 2 found a real provider in this exact state) — OAuth can never
      // complete for it, so it must never be inferred as "oauth"/"both" here.
      if (isGithub) {
        setAuthChoice("pat");
      } else {
        const hasOAuth =
          existingProvider.applicationId ||
          existingProvider.applicationSecretConfigured;
        const hasPat = existingProvider.adminTokenConfigured;
        if (hasOAuth && hasPat) setAuthChoice("both");
        else if (hasOAuth) setAuthChoice("oauth");
        else setAuthChoice("pat");
      }
      setStep(2);
    } else if (!isEdit) {
      setStep(1);
      setSelectedType(initialProviderType);
      setForm((prev) => ({ ...prev, redirectUri: fallbackRedirectUri }));
    }
  }, [
    isEdit,
    existingProvider,
    initialProviderType,
    fallbackRedirectUri,
    open,
  ]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep(isEdit ? 2 : 1);
    }
  }, [open, isEdit]);

  const set = <K extends keyof ProviderFormData>(
    k: K,
    v: ProviderFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  const effectiveRedirectUri = (form.redirectUri || fallbackRedirectUri).trim();

  const totalSteps = isEdit ? 3 : 4; // edit: Instance→Auth→Configure; create: Provider→Instance→Auth→Configure
  const stepOffset = isEdit ? 1 : 0; // shifts display step numbers

  const canProceed = useMemo(() => {
    if (step === 1) return PROVIDER_META[selectedType]?.available === true;
    if (step === 2)
      return form.name.trim().length > 0 && form.providerUrl.trim().length > 0;
    return true;
  }, [step, selectedType, form.name, form.providerUrl]);

  const showOAuth = authChoice === "oauth" || authChoice === "both";
  const showPAT = authChoice === "pat" || authChoice === "both";
  const hasOAuthCredentials =
    form.applicationId.trim().length > 0 &&
    (form.applicationSecret.trim().length > 0 ||
      (isEdit && form.applicationSecretConfigured));
  const hasPatCredentials =
    form.adminToken.trim().length > 0 || (isEdit && form.adminTokenConfigured);
  const canSubmit =
    (!showOAuth || hasOAuthCredentials) && (!showPAT || hasPatCredentials);

  const handleSubmit = async () => {
    if (isEdit && existingProvider) {
      const commonPayload: UpdateGitlabProviderPayload = {
        name: form.name.trim(),
        providerUrl: form.providerUrl.trim(),
        internalUrl: form.internalUrl.trim(),
        isDefault: form.isDefault,
      };
      const payload: UpdateGitlabProviderPayload =
        selectedType === "GITHUB"
          ? commonPayload
          : {
              ...commonPayload,
              applicationId: form.applicationId.trim(),
              groupNames: form.groupNames.trim(),
            };
      if (selectedType !== "GITHUB" && form.applicationSecret.trim()) {
        payload.applicationSecret = form.applicationSecret.trim();
      }
      if (form.adminToken.trim()) {
        payload.adminToken = form.adminToken.trim();
      }
      await onSave(payload);
    } else {
      const commonPayload: CreateGitlabProviderPayload = {
        name: form.name.trim(),
        providerUrl: form.providerUrl.trim(),
        internalUrl: form.internalUrl.trim(),
        adminToken: form.adminToken.trim(),
        isDefault: form.isDefault,
      };
      const payload: CreateGitlabProviderPayload =
        selectedType === "GITHUB"
          ? commonPayload
          : {
              ...commonPayload,
              applicationId: form.applicationId.trim(),
              applicationSecret: form.applicationSecret.trim(),
              groupNames: form.groupNames.trim(),
            };
      await onSave(payload, selectedType === "GITHUB" ? "GITHUB" : "GITLAB");
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const displayStep = step - stepOffset;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-card shadow-theme-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-primary">
              {isEdit
                ? "Modifier le fournisseur Git"
                : "Connecter un fournisseur Git"}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {isEdit
                ? "Modifiez la configuration et les identifiants du fournisseur"
                : "Ajoutez une intégration Git réutilisable par vos projets"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StepIndicator current={displayStep} total={totalSteps} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition hover:bg-hover/10 hover:text-primary"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
          style={{ maxHeight: "70vh" }}
        >
          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* ── STEP 1: Provider type ── */}
          {step === 1 && (
            <ProviderTypeStep
              selectedType={selectedType}
              onSelectType={setSelectedType}
            />
          )}

          {/* ── STEP 2: Instance configuration ── */}
          {step === 2 && (
            <InstanceConfigStep
              selectedType={selectedType}
              name={form.name}
              providerUrl={form.providerUrl}
              internalUrl={form.internalUrl}
              isDefault={form.isDefault}
              onNameChange={(v) => set("name", v)}
              onProviderUrlChange={(v) => set("providerUrl", v)}
              onInternalUrlChange={(v) => set("internalUrl", v)}
              onIsDefaultChange={(v) => set("isDefault", v)}
            />
          )}

          {/* ── STEP 3: Auth method ── */}
          {step === 3 && (
            <AuthMethodStep
              providerType={selectedType}
              authChoice={authChoice}
              onSelectAuthChoice={setAuthChoice}
            />
          )}

          {/* ── STEP 4: Configure credentials ── */}
          {step === 4 && (
            <ProviderCredentialsStep
              providerType={selectedType}
              isEdit={isEdit}
              showOAuth={showOAuth}
              showPAT={showPAT}
              effectiveRedirectUri={effectiveRedirectUri}
              copiedRedirect={copiedRedirect}
              applicationId={form.applicationId}
              applicationSecret={form.applicationSecret}
              applicationSecretConfigured={form.applicationSecretConfigured}
              groupNames={form.groupNames}
              adminToken={form.adminToken}
              adminTokenConfigured={form.adminTokenConfigured}
              onRedirectUriChange={(v) => set("redirectUri", v)}
              onCopyRedirectUri={onCopyRedirectUri}
              onApplicationIdChange={(v) => set("applicationId", v)}
              onApplicationSecretChange={(v) => set("applicationSecret", v)}
              onGroupNamesChange={(v) => set("groupNames", v)}
              onAdminTokenChange={(v) => set("adminToken", v)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {step > (isEdit ? 2 : 1) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep((s) => s - 1)}
                  icon={<ArrowLeft size={13} />}
                >
                  Retour
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Annuler
              </Button>

              {step < (isEdit ? 4 : 4) ? (
                <Button
                  size="sm"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canProceed}
                  icon={<ArrowRight size={13} />}
                >
                  Continuer
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => void handleSubmit()}
                  loading={saving}
                  disabled={saving || !canSubmit}
                  icon={saving ? undefined : <Check size={13} />}
                >
                  {isEdit ? "Enregistrer" : "Ajouter le fournisseur"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
