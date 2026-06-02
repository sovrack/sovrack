'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, GitBranch, Server, Shield, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/auth/use-auth';
import { getApiErrorMessage } from '@/lib/api';

const TEST_CREDENTIALS = {
  admin: {
    email: process.env.NEXT_PUBLIC_TEST_ADMIN_EMAIL ?? '',
    password: process.env.NEXT_PUBLIC_TEST_ADMIN_PASSWORD ?? '',
  },
  developer: {
    email: process.env.NEXT_PUBLIC_TEST_DEV_EMAIL ?? '',
    password: process.env.NEXT_PUBLIC_TEST_DEV_PASSWORD ?? '',
  },
} as const;

const FEATURES = [
  {
    icon: Rocket,
    title: 'Automated Deployments',
    description: 'Push to GitLab and watch your app deploy automatically via Ansible.',
  },
  {
    icon: GitBranch,
    title: 'GitLab Integration',
    description: 'Connect repos and groups. Webhook-driven CI/CD out of the box.',
  },
  {
    icon: Server,
    title: 'Multi-Server Management',
    description: 'SSH into any server — direct, bastion, or agent mode — in one place.',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'AES-256 encrypted credentials, RBAC roles, and full audit logging.',
  },
] as const;

export function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fillTest = (role: 'admin' | 'developer') => {
    const creds = TEST_CREDENTIALS[role];
    if (!creds.email) return;
    setError('');
    setEmail(creds.email);
    setPassword(creds.password);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err) || 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* Left — white form panel */}
      <section className="flex min-h-screen items-center justify-center bg-white px-6 py-12 sm:px-10 lg:min-h-0 lg:px-16 xl:px-24">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1B2B4B] shadow-sm">
              <Zap size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-gray-900">
              platform
            </span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900">
            Sign in to your account
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Manage deployments, servers, and pipelines.
          </p>

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#2D6BB5] focus:ring-4 focus:ring-[#2D6BB5]/10"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#2D6BB5] focus:ring-4 focus:ring-[#2D6BB5]/10"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#1B2B4B] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2D6BB5] focus:outline-none focus:ring-4 focus:ring-[#2D6BB5]/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {(TEST_CREDENTIALS.admin.email || TEST_CREDENTIALS.developer.email) && (
            <div className="mt-6 space-y-2">
              <p className="text-center text-xs font-medium text-gray-400">
                Quick access (dev only)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => fillTest('admin')}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
                >
                  Admin Test
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => fillTest('developer')}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
                >
                  Developer Test
                </button>
              </div>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-gray-400">
            NestJS 11 · Next.js 15 · Ansible · GitLab CI
          </p>
        </div>
      </section>

      {/* Right — platform gradient branding panel */}
      <section
        className="hidden lg:flex lg:flex-col lg:items-center lg:justify-center lg:px-12 lg:py-16"
        style={{ background: 'linear-gradient(135deg, #1B2B4B 0%, #2D6BB5 100%)' }}
      >
        <div className="w-full max-w-md">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
            Deploy Automation Platform
          </p>
          <h2 className="mt-3 text-3xl font-bold leading-snug text-white">
            Ship faster.<br />Sleep better.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/70">
            A self-hosted deployment platform built for engineering teams that run on GitLab.
            One config, every environment.
          </p>

          <div className="mt-10 space-y-4">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="flex items-start gap-4 rounded-2xl bg-white/10 px-5 py-4 backdrop-blur-sm"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
                  <Icon size={17} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-white/70">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
