'use client';

import { useState } from 'react';
import {
  AlertTriangle, ArrowRight, CheckCircle2, Copy, ExternalLink,
  GitBranch, Info, RefreshCw, Shield, XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import type { UseProjectSourceReturn } from '@/hooks/projects/use-project-source';
import type { Service } from '@/types/service';

const SERVICE_TYPE_COLORS: Record<string, string> = {
  APPLICATION: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  DATABASE: 'border-red-500/30 bg-red-500/10 text-red-400',
  COMPOSE: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  OTHER: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
};

export function SourceSection({ source, isOwner, onOpenSourceSetupDialog, services }: {
  source: UseProjectSourceReturn; isOwner: boolean; onOpenSourceSetupDialog: () => void;
  services?: Service[];
}) {
  const cfg = source.sourceConfig;
  if (!cfg) return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-300">
        <AlertTriangle size={14} /> No Git source connected
      </div>
      {isOwner && (
        <Button onClick={onOpenSourceSetupDialog} icon={<ArrowRight size={13} />}>
          Connect source
        </Button>
      )}
    </div>
  );

  const activeProvider = source.providers.find((p) => p.id === cfg.providerId);
  const isGroup = cfg.sourceType === 'GROUP';

  const gitlabOrigin = (() => {
    try { return cfg.gitlabUrl ? new URL(cfg.gitlabUrl).origin : null; } catch { return null; }
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10">
            <GitBranch size={16} className="text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {isGroup ? 'Group (multi-repo)' : 'Repository (source)'}
            </p>
            <p className="text-xs text-[var(--text-muted)]">Provider : {activeProvider?.name ?? 'Default'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isOwner && <Button variant="secondary" onClick={onOpenSourceSetupDialog}>Edit source</Button>}
          <button type="button" onClick={() => void source.loadSourceData()} disabled={source.sourceLoading}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50">
            <RefreshCw size={12} className={source.sourceLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'URL', value: cfg.gitlabUrl, mono: true, link: cfg.gitlabUrl },
          { label: 'Type', value: cfg.sourceType, mono: true },
          { label: 'Branch', value: cfg.defaultBranch ?? 'main', mono: true },
          { label: isGroup ? 'Group' : 'Repository', value: String(isGroup ? cfg.gitlabGroupId : cfg.gitlabId) ?? '—', mono: true },
          { label: 'Registry', value: cfg.registryUrl ?? 'Not configured', mono: true },
        ].map(({ label, value, mono, link }) => (
          <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
            {link
              ? <a href={link} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1 truncate text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <span className="truncate">{value}</span><ExternalLink size={9} />
                </a>
              : <p className={`mt-1.5 truncate text-xs font-medium text-[var(--text-primary)] ${mono ? 'font-mono' : ''}`}>{value}</p>
            }
          </div>
        ))}
      </div>

      {isGroup && services && services.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Services — {services.length}
          </p>
          <div className="space-y-2">
            {services.map((svc) => {
              return (
                <div key={svc.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3.5 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SERVICE_TYPE_COLORS[svc.type] ?? SERVICE_TYPE_COLORS.OTHER}`}>
                      {svc.type}
                    </span>
                    <span className="truncate text-sm font-medium text-[var(--text-primary)]">{svc.name}</span>
                    {svc.branch && <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">{svc.branch}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function WebhooksSection({ source }: { source: UseProjectSourceReturn }) {
  const [copied, setCopied] = useState(false);
  const cfg = source.sourceConfig;
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}/api/webhooks/gitlab`
    : '/api/webhooks/gitlab';

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* ignore */ }
  };

  const configured = cfg?.webhookSecretConfigured ?? false;
  const gitlabHooksUrl = cfg?.gitlabUrl ? `${cfg.gitlabUrl.replace(/\/$/, '')}/-/hooks` : null;

  return (
    <div className="space-y-4">
      <div className={clsx('flex items-start gap-3 rounded-xl border p-4', configured ? 'border-green-500/20 bg-green-500/8' : 'border-amber-500/20 bg-amber-500/8')}>
        {configured ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-400" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-amber-400" />}
        <div>
          <p className={`text-sm font-semibold ${configured ? 'text-green-300' : 'text-amber-300'}`}>
            {configured ? 'Webhook configured — auto-deploy active on push' : 'Webhook not configured — auto-deploy disabled'}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">Required for automatic deployments on git push.</p>
        </div>
        <Shield size={14} className={`ml-auto shrink-0 ${configured ? 'text-green-400' : 'text-[var(--text-muted)]'}`} />
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Webhook URL — add in GitLab</p>
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2.5">
          <code className="flex-1 break-all font-mono text-xs text-[var(--text-primary)]">{webhookUrl}</code>
          <button type="button" onClick={() => void handleCopy()}
            className="shrink-0 rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)]">
            {copied ? <CheckCircle2 size={12} className="text-green-400" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {!configured && (
        <div className="space-y-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
            <Info size={12} /> How to configure in GitLab
          </p>
          <ol className="space-y-1.5 pl-1">
            {[
              'Open your GitLab repo → Settings → Webhooks',
              'Paste the URL above in the "URL" field',
              'In "Secret token", paste the secret from your Git Provider (App Settings → Git Providers)',
              'Check: Push events, Pipeline events, Merge request events',
              'Click "Add webhook" → Test → Push events',
            ].map((text, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--hover)] text-[9px] font-bold text-[var(--text-muted)]">{i + 1}</span>
                {text}
              </li>
            ))}
          </ol>
          {gitlabHooksUrl && (
            <a href={gitlabHooksUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20">
              Open GitLab → Webhooks <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
