'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Server, Plus, RefreshCw, CheckCircle, XCircle,
  Loader2, Trash2, Zap, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { serversService } from '@/services/servers.service';
import { getApiErrorMessage } from '@/lib/api';
import { ServerStatusBadges } from '@/components/servers/server-status-badges';
import type { Server as ServerType } from '@/types/server';

export default function AdminServersPage() {
  const [servers, setServers] = useState<ServerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setServers(await serversService.getAll());
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchServers(); }, [fetchServers]);

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      const result = await serversService.verify(id);
      setServers((prev) =>
        prev.map((s) => s.id === id ? { ...s, ...result } : s),
      );
    } catch (err) {
      alert(getApiErrorMessage(err));
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete server "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await serversService.remove(id);
      setServers((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      alert(getApiErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const verifiedCount = servers.filter((s) => s.isVerified).length;
  const unverifiedCount = servers.length - verifiedCount;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-theme-xs md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-600">
              Infrastructure
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-900">
              Servers
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Register and verify target VPS nodes before using them in
              environments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchServers()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <Link
              href="/admin/servers/new"
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-600"
            >
              <Plus size={16} /> Add Server
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">Total servers</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {servers.length}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
              <ShieldCheck size={14} />
              Verified
            </div>
            <p className="mt-1 text-2xl font-semibold text-emerald-800">
              {verifiedCount}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-700">
              <AlertTriangle size={14} />
              Pending verification
            </div>
            <p className="mt-1 text-2xl font-semibold text-amber-800">
              {unverifiedCount}
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-slate-100 bg-white p-5">
              <div className="flex gap-4">
                <div className="h-10 w-10 rounded-xl bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-slate-200" />
                  <div className="h-3 w-24 rounded bg-slate-200" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && servers.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center shadow-theme-xs">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
            <Server size={28} className="text-brand-500" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-900">No servers yet</h3>
          <p className="mt-2 max-w-xs text-sm text-slate-500">
            Add a VPS with SSH credentials. After verification, it can host deployments.
          </p>
          <Link
            href="/admin/servers/new"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-600"
          >
            <Plus size={16} /> Add Server
          </Link>
        </div>
      )}

      {!loading && servers.length > 0 && (
        <div className="space-y-3">
          {servers.map((server) => (
            <div
              key={server.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs transition hover:border-slate-300 hover:shadow-theme-lg"
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${server.isVerified ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                    <Server size={18} className={server.isVerified ? 'text-emerald-600' : 'text-slate-400'} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-900">{server.name}</h3>
                      {server.isVerified
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><CheckCircle size={10} />Verified</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500"><XCircle size={10} />Not verified</span>
                      }
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">
                      {server.username}@{server.host}:{server.port}
                    </p>
                    <div className="mt-2">
                      <ServerStatusBadges
                        isVerified={server.isVerified}
                        hasDocker={server.hasDocker}
                        hasAnsible={server.hasAnsible}
                        hasRunner={server.hasRunner}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => void handleVerify(server.id)}
                    disabled={verifyingId === server.id}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {verifyingId === server.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Zap size={13} className="text-brand-500" />
                    }
                    Verify
                  </button>
                  <button
                    onClick={() => void handleDelete(server.id, server.name)}
                    disabled={deletingId === server.id}
                    className="flex items-center gap-1.5 rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingId === server.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />
                    }
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
