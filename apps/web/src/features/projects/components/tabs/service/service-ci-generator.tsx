"use client";

import { useEffect, useState } from "react";
import { Check, Copy, FileCode2, Loader2, Wand2, XCircle } from "lucide-react";
import { buildService } from "@/features/source-providers";
import { webhooksService } from "@/features/platform";
import { getApiErrorMessage } from "@/shared/lib/api";

type GenFile = { name: string; content: string };

/**
 * Onglet Standardisation (séparé du Pipeline — Task 2, "Correction rapide")
 * — génère (APERÇU) les fichiers standardisés du service : Dockerfile +
 * .dockerignore + fichier CI (.gitlab-ci.yml ou GitHub Actions), à coller
 * dans le dépôt. APERÇU UNIQUEMENT : rien n'est écrit dans le dépôt (zéro
 * risque de conflit/écrasement).
 */
export function ServiceCiGenerator({
  projectId,
  serviceId,
}: {
  projectId: string;
  serviceId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<GenFile[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  // Charger l'URL du webhook (le secret reste géré dans l'onglet Webhooks).
  useEffect(() => {
    let active = true;
    webhooksService
      .status(projectId, serviceId)
      .then((s) => {
        if (active) setWebhookUrl(s.webhookUrl ?? null);
      })
      .catch(() => {
        /* webhook non configuré — on guide l'utilisateur vers l'onglet Webhooks */
      });
    return () => {
      active = false;
    };
  }, [projectId, serviceId]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await buildService.prepare(projectId, serviceId);
      const out: GenFile[] = [];
      // Chemin fourni par le backend (GitLab → .gitlab-ci.yml,
      // GitHub → .github/workflows/deploy.yml).
      if (r.ciConfigContent)
        out.push({
          name: r.ciConfigFilePath || ".gitlab-ci.yml",
          content: r.ciConfigContent,
        });
      if (r.dockerfileContent)
        out.push({ name: "Dockerfile", content: r.dockerfileContent });
      if (r.dockerignoreContent)
        out.push({ name: ".dockerignore", content: r.dockerignoreContent });
      setFiles(out);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const copy = async (key: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Standardized CI/CD config
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Generates the <code className="font-mono">Dockerfile</code>, the{" "}
            <code className="font-mono">.dockerignore</code> and the CI file to{" "}
            <span className="font-semibold">paste into your repo</span>. Preview
            only — nothing is written to the repo (zero conflict risk).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Wand2 size={15} />
          )}{" "}
          Generate
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <XCircle size={14} /> {error}
        </div>
      )}

      {files.length > 0 && (
        <>
          {/* Mode d'emploi — 1-2-3 */}
          <ol className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--hover)]/40 p-4 text-xs text-[var(--text-secondary)]">
            <li>
              <span className="font-semibold text-[var(--text-primary)]">
                1. Colle chaque fichier
              </span>{" "}
              à l&apos;emplacement indiqué (le chemin est au-dessus de chaque
              bloc), à la racine de ton dépôt.
            </li>
            <li>
              <span className="font-semibold text-[var(--text-primary)]">
                2. Ajoute 2 variables CI
              </span>{" "}
              dans ton dépôt Git (GitLab : Settings → CI/CD → Variables ; GitHub
              : Settings → Secrets and variables → Actions) :
              <div className="mt-1.5 space-y-1">
                <VarLine
                  name="PLATFORM_DEPLOY_HOOK"
                  value={
                    webhookUrl ??
                    "(configure le webhook dans l’onglet Webhooks)"
                  }
                  copyable={Boolean(webhookUrl)}
                  copied={copied === "hook"}
                  onCopy={() => webhookUrl && void copy("hook", webhookUrl)}
                />
                <VarLine
                  name="platform_DEPLOY_TOKEN"
                  value="= le secret du webhook (onglet Webhooks)"
                  copyable={false}
                />
              </div>
            </li>
            <li>
              <span className="font-semibold text-[var(--text-primary)]">
                3. Push
              </span>{" "}
              → la CI build l&apos;image puis déclenche le déploiement platform.
            </li>
          </ol>

          {/* Fichiers générés */}
          {files.map((f) => (
            <div
              key={f.name}
              className="overflow-hidden rounded-xl border border-[var(--border)]"
            >
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--hover)]/40 px-3 py-1.5">
                <span className="flex items-center gap-1.5 font-mono text-xs text-[var(--text-secondary)]">
                  <FileCode2 size={12} /> {f.name}
                </span>
                <button
                  type="button"
                  onClick={() => void copy(f.name, f.content)}
                  className="flex items-center gap-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
                >
                  {copied === f.name ? (
                    <>
                      <Check size={12} /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={12} /> Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-green-300">
                {f.content}
              </pre>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function VarLine({
  name,
  value,
  copyable,
  copied,
  onCopy,
}: {
  name: string;
  value: string;
  copyable: boolean;
  copied?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5">
      <code className="font-mono text-[11px] font-semibold text-[var(--text-primary)]">
        {name}
      </code>
      <span className="truncate font-mono text-[11px] text-[var(--text-muted)]">
        {value}
      </span>
      {copyable && onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
        </button>
      )}
    </div>
  );
}
