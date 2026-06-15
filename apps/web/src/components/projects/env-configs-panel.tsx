'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import { environmentsService } from '@/services/environments.service';
import { getApiErrorMessage } from '@/lib/api';

type Props = {
  projectId: string;
  environmentId: string;
  onClose: () => void;
};

export function EnvConfigsPanel({ projectId, environmentId, onClose }: Props) {
  const [envJson, setEnvJson] = useState('{}');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const env = await environmentsService.getById(projectId, environmentId);
        setEnvJson(env.env ? JSON.stringify(JSON.parse(env.env), null, 2) : '{}');
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, environmentId]);

  const handleSave = async () => {
    try {
      JSON.parse(envJson);
    } catch {
      setError('Invalid JSON');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await environmentsService.update(projectId, environmentId, { env: envJson });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound size={13} className="text-[var(--text-muted)]" />
          <span className="text-xs font-semibold text-[var(--text-primary)]">Environment Variables</span>
        </div>
        <button type="button" onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
          <X size={11} />
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-[var(--text-muted)]">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={envJson}
            onChange={(e) => setEnvJson(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--text-primary)]/30"
          />
          <button type="button" onClick={() => void handleSave()} disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-40">
            {saving ? <Loader2 size={11} className="animate-spin" /> : null}
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
