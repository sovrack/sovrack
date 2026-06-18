'use client';

import { useState } from 'react';
import { Check, Copy, FileCode2, Loader2, Wand2, XCircle } from 'lucide-react';
import { buildService } from '@/services/build.service';
import { getApiErrorMessage } from '@/lib/api';

/**
 * Génère (aperçu) les fichiers CI/CD standardisés du service — `.gitlab-ci.yml`
 * (ou GitHub Actions) + Dockerfile — à copier/coller dans le dépôt. Optionnel :
 * tu peux garder ta propre CI. Couvre « standardiser les processus CI/CD ».
 */
export function ServiceCiGenerator({ projectId, serviceId }: { projectId: string; serviceId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<{ name: string; content: string }[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await buildService.prepare(projectId, serviceId);
      const out: { name: string; content: string }[] = [];
      if (r.gitlabCiContent) out.push({ name: '.gitlab-ci.yml', content: r.gitlabCiContent });
      if (r.dockerfileContent) out.push({ name: 'Dockerfile', content: r.dockerfileContent });
      if (r.dockerignoreContent) out.push({ name: '.dockerignore', content: r.dockerignoreContent });
      setFiles(out);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const copy = async (name: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(name);
      setTimeout(() => setCopied((c) => (c === name ? null : c)), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Config CI/CD standardisée</p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Génère un <code className="font-mono">.gitlab-ci.yml</code> / GitHub Actions + Dockerfile prêts à coller dans le dépôt. Facultatif — tu peux garder ta propre CI.
          </p>
        </div>
        <button type="button" onClick={() => void generate()} disabled={loading}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Générer
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <XCircle size={14} /> {error}
        </div>
      )}

      {files.map((f) => (
        <div key={f.name} className="overflow-hidden rounded-xl border border-[var(--border)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--hover)]/40 px-3 py-1.5">
            <span className="flex items-center gap-1.5 font-mono text-xs text-[var(--text-secondary)]"><FileCode2 size={12} /> {f.name}</span>
            <button type="button" onClick={() => void copy(f.name, f.content)}
              className="flex items-center gap-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
              {copied === f.name ? <><Check size={12} /> Copié</> : <><Copy size={12} /> Copier</>}
            </button>
          </div>
          <pre className="max-h-64 overflow-auto bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-green-300 whitespace-pre-wrap">{f.content}</pre>
        </div>
      ))}
    </div>
  );
}
