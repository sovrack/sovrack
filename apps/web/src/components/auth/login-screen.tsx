'use client';

import Image from 'next/image';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
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

export function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submitLogin = async (nextEmail: string, nextPassword: string) => {
    setError('');
    setLoading(true);

    try {
      await login(nextEmail, nextPassword);
      router.replace('/dashboard');
    } catch (err: unknown) {
      const message = getApiErrorMessage(err);
      setError(
        message || 'Email ou mot de passe invalide. Verifiez vos identifiants puis reessayez.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitLogin(email, password);
  };

  const fillTestCredentials = (mode: 'admin' | 'developer') => {
    const credentials =
      mode === 'admin' ? TEST_CREDENTIALS.admin : TEST_CREDENTIALS.developer;

    if (!credentials.email || !credentials.password) {
      setError(
        'Variables de test absentes. Configurez NEXT_PUBLIC_TEST_* dans .env.local.',
      );
      return;
    }

    setError('');
    setEmail(credentials.email);
    setPassword(credentials.password);
  };

  return (
    <div className="min-h-screen bg-[#eef3fb]">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="flex items-center bg-white px-6 py-10 sm:px-10 lg:px-16 xl:px-24">
          <div className="mx-auto w-full max-w-md">
            <h1 className="text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
              Connexion
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-500">
              Connectez-vous a votre espace.
            </p>

            {error && (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="vous@entreprise.com"
                  autoComplete="email"
                  required
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Saisissez votre mot de passe"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Connexion en cours...' : 'Se connecter'}
              </button>
            </form>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => fillTestCredentials('admin')}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Acces Admin Test
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => fillTestCredentials('developer')}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Acces Developer Test
              </button>
            </div>
          </div>
        </section>

        <section
          className="relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#e4eeff] via-[#f2f6ff] to-[#ffffff] px-8 py-14 sm:px-12 lg:px-16"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.62),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(98,138,255,0.18),transparent_28%)]" />
          <div className="relative z-10 max-w-lg text-center">
            <Image
              src="/platform-logo.jpeg"
              alt="Logo platform"
              width={220}
              height={220}
              className="mx-auto h-auto w-[180px] rounded-xl sm:w-[220px]"
              priority
            />

            <p className="mt-10 text-center text-2xl font-medium leading-snug tracking-[-0.03em] text-slate-900 sm:text-3xl">
              Bienvenue equipe platform
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
