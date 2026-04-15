'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Server } from 'lucide-react';
import { ServerForm } from '@/components/servers/server-form';
import { serversService } from '@/services/servers.service';
import { getApiErrorMessage } from '@/lib/api';
import type { CreateServerPayload } from '@/types/server';

export default function NewServerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (payload: CreateServerPayload) => {
    setLoading(true);
    setError(null);
    try {
      await serversService.create(payload);
      router.push('/admin/servers');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/servers" className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700">
          <ArrowLeft size={15} /> Back to Servers
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
            <Server size={20} className="text-slate-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Add Server</h1>
            <p className="text-sm text-slate-500">Register a new VPS target for deployments.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <ServerForm onSubmit={handleCreate} loading={loading} error={error} />
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
        <p className="text-xs font-semibold text-amber-700">⚡ After adding</p>
        <ul className="mt-2 space-y-1 text-xs text-amber-600">
          <li>→ Pick SSH, Bastion, or Agent connection mode based on network topology</li>
          <li>→ Choose Manual to update readiness from the server checklist</li>
          <li>→ Choose SSH Auto-verify to run remote checks right after creation</li>
          <li>→ A server must be marked verified before linking to environments</li>
        </ul>
      </div>
    </div>
  );
}
