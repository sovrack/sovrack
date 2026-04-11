'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api';
import { platformConfigService } from '@/services/platform-config.service';
import type { PlatformConfigItem } from '@/types/platform-config';

type ToastTone = 'success' | 'error';

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingGitlab, setTestingGitlab] = useState(false);
  const [gitlabTest, setGitlabTest] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [gitlabUrl, setGitlabUrl] = useState('');
  const [gitlabToken, setGitlabToken] = useState('');
  const [platformName, setPlatformName] = useState('Deploy Automation');

  const showToast = useCallback((message: string, tone: ToastTone) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 2600);
  }, []);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await platformConfigService.getAll();
      const asMap = new Map<string, PlatformConfigItem>(
        rows.map((item) => [item.key, item]),
      );
      setGitlabUrl(asMap.get('GITLAB_URL')?.value ?? '');
      setGitlabToken('');
      setPlatformName(asMap.get('PLATFORM_NAME')?.value ?? 'Deploy Automation');
    } catch (fetchError) {
      setError(getApiErrorMessage(fetchError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const hasGitlabTokenInput = gitlabToken.trim().length > 0;

  const canSaveGitlab = useMemo(
    () => gitlabUrl.trim().length > 0,
    [gitlabUrl],
  );

  const saveGitlab = async () => {
    if (!canSaveGitlab) {
      showToast('GitLab URL est requis', 'error');
      return;
    }

    setSavingKey('GITLAB');
    setError(null);
    try {
      await platformConfigService.update('GITLAB_URL', {
        value: gitlabUrl.trim(),
        isSecret: false,
      });

      if (hasGitlabTokenInput) {
        await platformConfigService.update('GITLAB_TOKEN', {
          value: gitlabToken.trim(),
          isSecret: true,
        });
        setGitlabToken('');
      }

      showToast('Configuration GitLab sauvegardée', 'success');
    } catch (saveError) {
      const message = getApiErrorMessage(saveError);
      setError(message);
      showToast(message, 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const savePlatformName = async () => {
    if (!platformName.trim()) {
      showToast('Le nom de plateforme est requis', 'error');
      return;
    }

    setSavingKey('PLATFORM_NAME');
    setError(null);
    try {
      await platformConfigService.update('PLATFORM_NAME', {
        value: platformName.trim(),
        isSecret: false,
      });
      showToast('Nom de plateforme sauvegardé', 'success');
    } catch (saveError) {
      const message = getApiErrorMessage(saveError);
      setError(message);
      showToast(message, 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const testGitlab = async () => {
    setTestingGitlab(true);
    setError(null);
    try {
      const result = await platformConfigService.testGitlab();
      setGitlabTest(result);
      showToast(result.message, 'success');
    } catch (testError) {
      const message = getApiErrorMessage(testError);
      setGitlabTest({ ok: false, message });
      setError(message);
      showToast(message, 'error');
    } finally {
      setTestingGitlab(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="space-y-4">
            <div className="h-10 animate-pulse rounded bg-slate-200" />
            <div className="h-10 animate-pulse rounded bg-slate-200" />
            <div className="h-10 w-40 animate-pulse rounded bg-slate-200" />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="space-y-4">
            <div className="h-10 animate-pulse rounded bg-slate-200" />
            <div className="h-10 w-40 animate-pulse rounded bg-slate-200" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-600">
          Administration
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-900">
          Platform Settings
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Configure global GitLab access and platform identity from the UI.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-theme-xs">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Configuration GitLab globale
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              URL et token de test global administrateur.
            </p>
          </div>
          {gitlabTest && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                gitlabTest.ok
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {gitlabTest.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              {gitlabTest.ok ? 'Connexion OK' : 'Connexion KO'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              GitLab URL
            </label>
            <input
              type="text"
              value={gitlabUrl}
              onChange={(event) => setGitlabUrl(event.target.value)}
              placeholder="https://gitlab.example.com"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Token global
            </label>
            <input
              type="password"
              value={gitlabToken}
              onChange={(event) => setGitlabToken(event.target.value)}
              placeholder="***"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 font-mono text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
            <p className="mt-1 text-xs text-slate-400">
              Laissez vide pour conserver le token secret actuel.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveGitlab()}
            disabled={savingKey === 'GITLAB'}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {savingKey === 'GITLAB' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            Sauvegarder
          </button>
          <button
            type="button"
            onClick={() => void testGitlab()}
            disabled={testingGitlab}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {testingGitlab ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ShieldCheck size={15} />
            )}
            Tester connexion
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-theme-xs">
        <h2 className="text-lg font-semibold text-slate-900">Nom de la plateforme</h2>
        <p className="mt-1 text-sm text-slate-500">
          Définit l’identité globale affichée dans l’interface.
        </p>

        <div className="mt-4 max-w-2xl">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            PLATFORM_NAME
          </label>
          <input
            type="text"
            value={platformName}
            onChange={(event) => setPlatformName(event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <button
          type="button"
          onClick={() => void savePlatformName()}
          disabled={savingKey === 'PLATFORM_NAME'}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
        >
          {savingKey === 'PLATFORM_NAME' ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Save size={15} />
          )}
          Sauvegarder
        </button>
      </section>

      <div className="pointer-events-none fixed right-4 top-4 z-[100] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.tone === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
