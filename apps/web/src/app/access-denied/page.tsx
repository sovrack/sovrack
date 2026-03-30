import Link from 'next/link';

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="surface-card fade-up w-full max-w-lg rounded-2xl p-8 text-center">
        <p className="mono text-xs uppercase tracking-[0.2em] text-slate-500">403</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Access Denied</h1>
        <p className="mt-3 text-sm text-slate-600">
          You do not have permission to access this section. Contact an administrator if needed.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Back to Dashboard
          </Link>
          <Link
            href="/profile"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            View Profile
          </Link>
        </div>
      </section>
    </main>
  );
}
