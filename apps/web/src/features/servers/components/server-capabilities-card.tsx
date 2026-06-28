import type { ServerCapability } from '@/features/servers/types/server';

type Props = {
  capabilities: ServerCapability[];
};

export function ServerCapabilitiesCard({ capabilities }: Props) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        Capabilities
      </p>
      <h3 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
        Detected server facts
      </h3>
      {capabilities.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">No capabilities detected yet.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {capabilities.map((capability) => (
            <div
              key={capability.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-3 py-2"
            >
              <p className="font-mono text-xs text-[var(--text-secondary)]">{capability.key}</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {capability.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
