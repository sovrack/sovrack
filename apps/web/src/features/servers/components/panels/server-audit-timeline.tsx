import { Badge } from "@/shared/ui/badge";
import type { ServerAuditEvent } from "@/features/servers/types/server";

type Props = {
  events: ServerAuditEvent[];
};

function toneFromEvent(eventType: string) {
  if (eventType.includes("FAIL") || eventType.includes("ERROR"))
    return "error" as const;
  if (eventType.includes("PREPARATION") || eventType.includes("VALIDATE"))
    return "info" as const;
  if (eventType.includes("CREATE") || eventType.includes("EDIT"))
    return "success" as const;
  return "default" as const;
}

function eventLabel(eventType: string): string {
  return eventType.replace(/_/g, " ");
}

export function ServerAuditTimeline({ events }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-secondary">
        Audit
      </p>
      <h3 className="mt-1 text-lg font-semibold text-primary">
        Sensitive actions trace
      </h3>
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-secondary">
          No audit event available yet.
        </p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {events.map((event) => (
            <div
              key={event.id}
              className="rounded-lg border border-border bg-hover/10 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={toneFromEvent(event.eventType)}>
                  {eventLabel(event.eventType)}
                </Badge>
                <span className="text-xs text-secondary">
                  {new Date(event.createdAt).toLocaleString()}
                </span>
                {event.actorId && (
                  <span className="rounded-md bg-card px-2 py-0.5 text-[11px] text-secondary">
                    actor: {event.actorId}
                  </span>
                )}
              </div>
              {event.payloadJson && (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 p-2 text-[11px] text-primary">
                  {JSON.stringify(event.payloadJson, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
