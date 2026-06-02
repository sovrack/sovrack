'use client';

import { useState } from 'react';
import { Globe, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { getApiErrorMessage } from '@/lib/api';
import { dnsService } from '@/services/dns.service';
import type { DnsProvider, DnsProviderType } from '@/types/dns';

export default function DnsSettingsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [providerName, setProviderName] = useState('Manual DNS');
  const [providerType, setProviderType] = useState<DnsProviderType>('MANUAL');
  const [domainName, setDomainName] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [submittingProvider, setSubmittingProvider] = useState(false);
  const [submittingDomain, setSubmittingDomain] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['dns-settings'],
    queryFn: async () => {
      const [providers, domains] = await Promise.all([
        dnsService.listProviders(),
        dnsService.listDomains(),
      ]);
      return { providers, domains };
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const providers = data?.providers ?? [];
  const domains = data?.domains ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['dns-settings'] });

  const handleCreateProvider = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingProvider(true);
    setError(null);
    try {
      await dnsService.createProvider({ name: providerName.trim(), type: providerType });
      await invalidate();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmittingProvider(false);
    }
  };

  const handleCreateDomain = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingDomain(true);
    setError(null);
    try {
      await dnsService.createDomain({ name: domainName.trim(), providerId: selectedProviderId || undefined });
      setDomainName('');
      await invalidate();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmittingDomain(false);
    }
  };

  const handleTestProvider = async (provider: DnsProvider) => {
    setTestMessage(null);
    try {
      const result = await dnsService.testProvider(provider.id);
      setTestMessage(result.message);
    } catch (err) {
      setTestMessage(getApiErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="DNS Providers"
        description="Manage domains, manual DNS instructions, and service routing foundations."
        actions={
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-card)]/10 disabled:opacity-50"
          >
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {testMessage && <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">{testMessage}</div>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Create provider" description="Start with MANUAL provider, then automate later with Cloudflare.">
          <form onSubmit={(e) => void handleCreateProvider(e)} className="space-y-3">
            <input value={providerName} onChange={(e) => setProviderName(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3 text-sm text-[var(--text-primary)] outline-none" placeholder="Provider name" />
            <select value={providerType} onChange={(e) => setProviderType(e.target.value as DnsProviderType)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3 text-sm text-[var(--text-primary)] outline-none">
              <option value="MANUAL">MANUAL</option>
              <option value="CLOUDFLARE">CLOUDFLARE</option>
              <option value="DIGITALOCEAN">DIGITALOCEAN</option>
              <option value="OVH">OVH</option>
            </select>
            <button type="submit" disabled={submittingProvider} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] disabled:opacity-60">
              {submittingProvider ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create provider
            </button>
          </form>
        </SectionCard>

        <SectionCard title="Add domain" description="Attach domains now, then map records to services/environments.">
          <form onSubmit={(e) => void handleCreateDomain(e)} className="space-y-3">
            <input value={domainName} onChange={(e) => setDomainName(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3 text-sm text-[var(--text-primary)] outline-none" placeholder="example.com" />
            <select value={selectedProviderId} onChange={(e) => setSelectedProviderId(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3 text-sm text-[var(--text-primary)] outline-none">
              <option value="">No provider</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="submit" disabled={submittingDomain || !domainName.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] disabled:opacity-60">
              {submittingDomain ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />} Add domain
            </button>
          </form>
        </SectionCard>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-[var(--bg-card)]/10" />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SectionCard title="Providers">
            <div className="space-y-2">
              {providers.map((provider) => (
                <div key={provider.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{provider.name}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{provider.type}</p>
                  </div>
                  <button onClick={() => void handleTestProvider(provider)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Test</button>
                </div>
              ))}
              {providers.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No DNS providers yet.</p>}
            </div>
          </SectionCard>
          <SectionCard title="Domains">
            <div className="space-y-2">
              {domains.map((domain) => (
                <div key={domain.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{domain.name}</p>
                    <span className="rounded-full bg-[var(--text-primary)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">{domain.verified ? 'verified' : 'manual setup'}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{(domain.records?.length ?? 0)} record(s)</p>
                </div>
              ))}
              {domains.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No domains yet.</p>}
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
