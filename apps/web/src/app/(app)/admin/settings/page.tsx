'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { getApiErrorMessage } from '@/lib/api';
import { platformConfigService } from '@/services/platform-config.service';
import type { PlatformConfigItem } from '@/types/platform-config';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type ToastTone = 'success' | 'error';

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
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

  const savePlatformName = async () => {
    if (!platformName.trim()) {
      showToast('Le nom de plateforme est requis', 'error');
      return;
    }

    setSaving(true);
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
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-[var(--hover)]" />
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <div className="space-y-4">
            <div className="h-10 animate-pulse rounded bg-[var(--hover)]" />
            <div className="h-10 w-40 animate-pulse rounded bg-[var(--hover)]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Platform Settings"
        description="Configure global platform identity."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <SectionCard
        title="Platform name"
        description="Defines the global identity displayed throughout the interface."
      >
        <div className="mt-4 max-w-2xl">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
            PLATFORM_NAME
          </label>
          <input
            type="text"
            value={platformName}
            onChange={(event) => setPlatformName(event.target.value)}
            className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:ring-2 focus:ring-zinc-500/20"
          />
        </div>

        <Button
          type="button"
          onClick={() => void savePlatformName()}
          disabled={saving}
          className="mt-5"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Save
        </Button>
      </SectionCard>

      <div className="pointer-events-none fixed right-4 top-4 z-[100] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.tone === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
