'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
        'Invalid email or password'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center px-4 py-8 lg:px-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-2">
        <section className="surface-card fade-up hidden rounded-2xl p-8 lg:block">
          <p className="mono text-xs uppercase tracking-[0.2em] text-slate-500">Platform Console</p>
          <h1 className="mt-4 text-5xl font-semibold leading-tight text-slate-900">
            Ship Faster.
            <br />
            Deploy Safer.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-600">
            Track projects, deployments, and environments from one control room designed for developers and admins.
          </p>

          <div className="mt-8 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
              <p className="mono text-xs text-slate-500">Realtime Signals</p>
              <p className="mt-1 text-sm font-medium text-slate-800">Live deployment states and logs</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
              <p className="mono text-xs text-slate-500">Role Based Access</p>
              <p className="mt-1 text-sm font-medium text-slate-800">Clear ADMIN and DEVELOPER scopes</p>
            </div>
          </div>
        </section>

        <section className="surface-card fade-up rounded-2xl p-7 sm:p-9">
          <div className="mb-6">
            <p className="mono text-xs uppercase tracking-[0.2em] text-slate-500">Authentication</p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-900">Sign in to workspace</h2>
            <p className="mt-2 text-sm text-slate-600">Use your credentials to access dashboard and operations.</p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dev@example.com"
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Access Workspace'}
            </button>
          </form>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="mono mb-2 text-xs uppercase tracking-wide text-slate-500">Demo Credentials</p>
            <p><span className="font-semibold">ADMIN:</span> admin@devops.com / password</p>
            <p><span className="font-semibold">DEVELOPER:</span> dev@devops.com / password</p>
          </div>
        </section>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-0 right-0 text-center">
        <p className="mono text-[11px] tracking-wide text-slate-500">DevOps Platform • 2026</p>
      </div>
    </div>
  );
}
