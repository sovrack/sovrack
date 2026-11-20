import { Check, FolderGit2, Loader2, Search, X } from "lucide-react";
import type { SourceProviderOption } from "@/features/projects/types/project";
import type { GitRepoItem } from "@/features/platform";
import { Input } from "@/shared/ui/input";
import { KINDS, repoToName, type ServiceKind } from "./add-service-wizard.catalog";

/* Petits composants de présentation du wizard « Create Service » (extraits pour
   garder add-service-wizard.tsx sous la limite de taille). */

/** Étape 1 : choix du type de service (grille des KINDS). */
export function KindPicker({ onPick }: { onPick: (k: ServiceKind) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {KINDS.map((k) => (
        <button
          key={k.kind}
          type="button"
          onClick={() => onPick(k.kind)}
          className="flex items-start gap-3 rounded-lg border border-border bg-app p-4 text-left transition hover:border-muted hover:bg-hover/10"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-secondary">
            {k.icon}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm font-semibold text-primary">
              {k.label}
              {k.badge && (
                <span className="rounded-md border border-border bg-hover/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                  {k.badge}
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              {k.hint}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="truncate font-medium text-primary">{v}</dd>
    </div>
  );
}

export function ProviderSelect({
  providers,
  value,
  onChange,
}: {
  providers: SourceProviderOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
        Provider
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-app px-3 py-2 text-sm text-primary outline-none"
      >
        {providers.length === 0 ? (
          <option value="">
            No provider configured — add one in Git Providers
          </option>
        ) : null}
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.type}
            {p.isDefault ? " (default)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

export type RepoItem = GitRepoItem;

export function RepoOneClickSection({
  loadingRepos,
  platform,
  providerRepos,
  repoSearch,
  setRepoSearch,
  repoPath,
  pickRepo,
  setRepoMode,
  branch,
  setBranch,
  port,
  setPort,
  name,
  setName,
}: {
  loadingRepos: boolean;
  platform: string;
  providerRepos: RepoItem[];
  repoSearch: string;
  setRepoSearch: (s: string) => void;
  repoPath: string;
  pickRepo: (r: RepoItem) => void;
  setRepoMode: (m: "list" | "manual") => void;
  branch: string;
  setBranch: (s: string) => void;
  port: string;
  setPort: (s: string) => void;
  name: string;
  setName: (s: string) => void;
}) {
  const filteredRepos = providerRepos.filter(
    (r) =>
      !repoSearch ||
      r.fullName.toLowerCase().includes(repoSearch.toLowerCase()) ||
      r.name.toLowerCase().includes(repoSearch.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="text"
          value={repoSearch}
          onChange={(e) => setRepoSearch(e.target.value)}
          placeholder="Rechercher un dépôt parmi vos projets..."
          className="w-full rounded-lg border border-border bg-app py-2 pl-9 pr-8 text-xs text-primary placeholder:text-muted focus:border-accent focus:outline-none"
        />
        {repoSearch && (
          <button
            type="button"
            onClick={() => setRepoSearch("")}
            title="Effacer la recherche"
            aria-label="Effacer la recherche"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted hover:text-primary"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {!loadingRepos && providerRepos.length > 0 && (
        <div className="flex items-center justify-between px-1 text-[11px] text-muted">
          <span>
            {filteredRepos.length}{" "}
            {filteredRepos.length > 1 ? "dépôts trouvés" : "dépôt trouvé"}
          </span>
          {repoSearch && (
            <span className="text-[10px] font-medium text-secondary">
              Filtre actif
            </span>
          )}
        </div>
      )}

      {loadingRepos ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border py-8 text-xs text-secondary">
          <Loader2
            size={16}
            className="animate-spin text-primary"
          />
          Chargement de vos dépôts {platform}...
        </div>
      ) : providerRepos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-secondary">
          Aucun dépôt trouvé ou token en attente.{" "}
          <button
            type="button"
            onClick={() => setRepoMode("manual")}
            className="font-semibold text-primary underline"
          >
            Passer en mode Manuel
          </button>
        </div>
      ) : filteredRepos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-secondary">
          Aucun dépôt ne correspond à &ldquo;{repoSearch}&rdquo;.{" "}
          <button
            type="button"
            onClick={() => setRepoSearch("")}
            className="font-semibold text-primary underline"
          >
            Réinitialiser le filtre
          </button>
        </div>
      ) : (
        <div className="max-h-44 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-app">
          {filteredRepos
            .map((r) => {
              const isSelected = repoPath === r.fullName;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pickRepo(r)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition hover:bg-hover/10 ${
                    isSelected
                      ? "bg-hover/10 font-semibold text-primary"
                      : "text-secondary"
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FolderGit2
                      size={14}
                      className={
                        isSelected
                          ? "shrink-0 text-primary"
                          : "shrink-0 text-muted"
                      }
                    />
                    <span className="truncate">{r.fullName}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded bg-hover/10 px-1.5 py-0.5 text-[10px] text-muted">
                      {r.defaultBranch}
                    </span>
                    {isSelected && (
                      <Check size={14} className="text-green-400" />
                    )}
                  </div>
                </button>
              );
            })}
        </div>
      )}

      {repoPath && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-2.5 text-xs text-green-300">
          Dépôt sélectionné : <span className="font-semibold">{repoPath}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Branche"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        />
        <Input
          label="Port interne"
          value={port}
          onChange={(e) => setPort(e.target.value)}
        />
      </div>
      <Input
        label="Nom du service (optionnel)"
        placeholder={repoPath ? repoToName(repoPath) : "api"}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
    </div>
  );
}

