type StatsCardProps = {
  title: string;
  value: number | string;
  hint?: string;
  tone?: 'brand' | 'ok' | 'accent';
};

const toneMap: Record<'brand' | 'ok' | 'accent', string> = {
  brand: 'from-blue-600/15 to-blue-100/40 border-blue-200',
  ok: 'from-emerald-600/15 to-emerald-100/40 border-emerald-200',
  accent: 'from-orange-500/20 to-orange-100/40 border-orange-200',
};

export function StatsCard({ title, value, hint, tone = 'brand' }: StatsCardProps) {
  return (
    <div className={`fade-up rounded-2xl border bg-gradient-to-br p-5 shadow-sm ${toneMap[tone]}`}>
      <p className="mono text-xs uppercase tracking-[0.15em] text-slate-500">{title}</p>
      <p className="mt-2 text-4xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-600">{hint}</p> : null}
    </div>
  );
}
