"use client";

import {
  ArrowLeft,
  Check,
  FolderGit2,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { ProviderSelect, KindPicker } from "./add-service-wizard.parts";
import {
  DatabaseStep,
  DockerStep,
  ComposeStep,
  TemplateStep,
  ReviewStep,
} from "./add-service-wizard.steps";
import {
  KINDS,
  normalizeRepoPath,
  repoToName,
  type ServiceKind,
  type AppMode,
  type Step,
} from "./add-service-wizard.catalog";
import { useAddServiceWizard } from "@/features/projects/hooks/use-add-service-wizard";

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** Type pré-sélectionné (depuis le dropdown « Create Service ») → saute l'étape 1. */
  initialKind?: ServiceKind;
};

/* ─── Wizard ────────────────────────────────────────────────────────────── */

export function AddServiceWizard({
  projectId,
  open,
  onClose,
  onCreated,
  initialKind,
}: Props) {
  const {
    step, setStep,
    kind, appMode, setAppMode,
    platform, setPlatform,
    error, submitting,
    providers, providerId, setProviderId,
    name, setName,
    token, setToken,
    repoPath, setRepoPath,
    branch, setBranch,
    port, setPort,
    groupPath, setGroupPath,
    discovering, discovered,
    selected, setSelected,
    databaseType, setDatabaseType,
    databaseVersion, setDatabaseVersion,
    image, setImage,
    composeContent, setComposeContent,
    templates, templateId, setTemplateId,
    selectedTemplate, selectedProvider,
    canReview,
    pickKind, pickPlatform, discover, toggleRepo, submit,
  } = useAddServiceWizard({ projectId, open, initialKind, onCreated, onClose });

  if (!open) return null;

  const kindLabel = KINDS.find((k) => k.kind === kind)?.label ?? "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        {/* Header + stepper */}
        <div className="border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Add service
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-[var(--text-primary)]">
                {step === 1
                  ? "Choose a service type"
                  : step === 2
                    ? `Configure ${kindLabel}`
                    : "Review & create"}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]"
            >
              <X size={15} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${s <= step ? "bg-[var(--text-primary)]" : "bg-[var(--border)]"}`}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Step 1 — type */}
          {step === 1 && <KindPicker onPick={pickKind} />}

          {/* Step 2a — choose Git platform (photo 2) */}
          {step === 2 && kind === "APPLICATION" && !platform && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                Choose the Git platform for this service.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    type: "GITLAB" as const,
                    label: "GitLab",
                    icon: <FolderGit2 size={22} className="text-orange-400" />,
                    hint: "DevSecOps platform",
                  },
                  {
                    type: "GITHUB" as const,
                    label: "GitHub",
                    icon: <FolderGit2 size={22} />,
                    hint: "Code hosting platform",
                  },
                ].map((pl) => {
                  const has = providers.some((p) => p.type === pl.type);
                  return (
                    <button
                      key={pl.type}
                      type="button"
                      onClick={() => pickPlatform(pl.type)}
                      className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-5 text-center transition hover:border-[var(--text-muted)] hover:bg-[var(--hover)]"
                    >
                      <span className="text-[var(--text-primary)]">
                        {pl.icon}
                      </span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {pl.label}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {has
                          ? pl.hint
                          : "Not configured — add it in Git Providers"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2b — configure (photo 1) */}
          {step === 2 && kind === "APPLICATION" && platform && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setPlatform(null)}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                ← Change platform ({platform})
              </button>
              {providers.filter((p) => p.type === platform).length === 0 ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                  No {platform} provider configured yet.{" "}
                  <a href="/settings/git" className="font-semibold underline">
                    Add one in Git Providers
                  </a>
                  , then reopen this wizard.
                </div>
              ) : (
                <>
                  <ProviderSelect
                    providers={providers.filter((p) => p.type === platform)}
                    value={providerId}
                    onChange={setProviderId}
                  />

                  <div className="flex gap-1.5">
                    {(["repo", "group"] as AppMode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setAppMode(m)}
                        className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${appMode === m ? "border-[var(--text-primary)] bg-[var(--hover)] text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--hover)]"}`}
                      >
                        {m === "repo"
                          ? "Single repository"
                          : "Import a whole group"}
                      </button>
                    ))}
                  </div>

                  {appMode === "repo" ? (
                    <>
                      <Input
                        label="Repository path"
                        placeholder="group/project or owner/repo (or paste full URL)"
                        value={repoPath}
                        onChange={(e) =>
                          setRepoPath(normalizeRepoPath(e.target.value))
                        }
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="Branch"
                          value={branch}
                          onChange={(e) => setBranch(e.target.value)}
                        />
                        <Input
                          label="Port"
                          value={port}
                          onChange={(e) => setPort(e.target.value)}
                        />
                      </div>
                      <Input
                        label="Service name (optional)"
                        placeholder={repoPath ? repoToName(repoPath) : "api"}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </>
                  ) : (
                    <>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <Input
                            label="Group / org path"
                            placeholder="company/my-apps"
                            value={groupPath}
                            onChange={(e) => setGroupPath(e.target.value)}
                          />
                        </div>
                        <Button
                          variant="secondary"
                          onClick={() => void discover()}
                          disabled={discovering}
                          icon={
                            discovering ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Search size={14} />
                            )
                          }
                        >
                          Discover
                        </Button>
                      </div>
                      {discovered.length > 0 && (
                        <div className="rounded-xl border border-[var(--border)]">
                          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
                            <span>
                              {selected.size}/{discovered.length} selected
                            </span>
                            <button
                              type="button"
                              className="font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                              onClick={() =>
                                setSelected(
                                  new Set(
                                    selected.size === discovered.length
                                      ? []
                                      : discovered.map((r) => r.repoPath),
                                  ),
                                )
                              }
                            >
                              {selected.size === discovered.length
                                ? "Clear all"
                                : "Select all"}
                            </button>
                          </div>
                          <div className="max-h-48 overflow-auto p-1.5">
                            {discovered.map((r) => (
                              <label
                                key={r.repoPath}
                                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--hover)]"
                              >
                                <input
                                  type="checkbox"
                                  checked={selected.has(r.repoPath)}
                                  onChange={() => toggleRepo(r.repoPath)}
                                />
                                <span className="font-mono text-xs text-[var(--text-primary)]">
                                  {r.repoPath}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <Input
                    label={
                      selectedProvider?.status === "CONFIGURED"
                        ? "Access token (PAT) — optional, provider already connected"
                        : "Access token (PAT)"
                    }
                    type="password"
                    placeholder={
                      selectedProvider?.status === "CONFIGURED"
                        ? "Leave empty to use the connected provider"
                        : "Required to read the repo"
                    }
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </>
              )}
            </div>
          )}

          {step === 2 && kind === "DATABASE" && (
            <DatabaseStep
              databaseType={databaseType}
              databaseVersion={databaseVersion}
              name={name}
              setDatabaseType={setDatabaseType}
              setDatabaseVersion={setDatabaseVersion}
              setName={setName}
            />
          )}

          {step === 2 && kind === "DOCKER" && (
            <DockerStep
              name={name} image={image} port={port}
              setName={setName} setImage={setImage} setPort={setPort}
            />
          )}

          {step === 2 && kind === "COMPOSE" && (
            <ComposeStep
              name={name} composeContent={composeContent}
              setName={setName} setComposeContent={setComposeContent}
            />
          )}

          {step === 2 && kind === "TEMPLATE" && (
            <TemplateStep
              templates={templates}
              templateId={templateId}
              name={name}
              selectedTemplate={selectedTemplate}
              setTemplateId={setTemplateId}
              setName={setName}
            />
          )}

          {/* Step 3 — review */}
          {step === 3 && (
            <ReviewStep
              kindLabel={kindLabel}
              kind={kind}
              appMode={appMode}
              providerName={selectedProvider?.name}
              repoPath={repoPath}
              branch={branch}
              name={name}
              groupPath={groupPath}
              selectedCount={selected.size}
              databaseType={databaseType}
              databaseVersion={databaseVersion}
              image={image}
              port={port}
              composeContent={composeContent}
              selectedTemplate={selectedTemplate}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
          <Button
            variant="secondary"
            onClick={() =>
              step === 1 ? onClose() : setStep((step - 1) as Step)
            }
            icon={step === 1 ? <X size={14} /> : <ArrowLeft size={14} />}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step === 2 && (
            <Button onClick={() => setStep(3)} disabled={!canReview}>
              Review →
            </Button>
          )}
          {step === 3 && (
            <Button
              onClick={() => void submit()}
              disabled={submitting}
              icon={
                submitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )
              }
            >
              {kind === "APPLICATION" && appMode === "group"
                ? `Create ${selected.size} service${selected.size > 1 ? "s" : ""}`
                : kind === "TEMPLATE" && selectedTemplate
                  ? `Create ${selectedTemplate.services.length} services`
                  : "Create service"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
