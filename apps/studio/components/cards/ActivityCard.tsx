import { Card, CardTitle } from "./Card";
import { cn } from "@sgrs/ui";
import type { SgrsEvent } from "@sgrs/client-ts";

// ─── Event → display ──────────────────────────────────────────────────────────

type Accent = "ok" | "risk" | "amber" | "blue" | "fog";

interface DisplayRow {
  t: string;
  head: string;
  em?: string;
  accent?: Accent;
}

/** Translate a typed SgrsEvent into a business-readable row. */
function describe(event: SgrsEvent): DisplayRow {
  const t = new Date(event.timestamp).toLocaleTimeString(undefined, {
    hour:   "2-digit",
    minute: "2-digit",
  });

  switch (event.type) {
    case "scope.created":
      return { t, head: "Scope created:", em: event.payload.name, accent: "ok" };

    case "scope.updated":
      return { t, head: "Scope updated:", em: event.payload.name };

    case "scope.deleted":
      return { t, head: "Scope removed:", em: event.scopeId, accent: "fog" };

    case "scope.finality.changed": {
      const dir     = event.delta >= 0 ? "↑" : "↓";
      const sign    = event.delta >= 0 ? "+" : "";
      const accent: Accent = event.delta >= 0 ? "ok" : "risk";
      return {
        t,
        head: `Convergence ${dir}`,
        em:   `score ${event.payload.score.toFixed(3)} (${sign}${event.delta.toFixed(3)})`,
        accent,
      };
    }

    case "scope.finality.near-final":
      return {
        t,
        head:   "Near-finality reached ·",
        em:     `score ${event.payload.score.toFixed(3)}`,
        accent: "amber",
      };

    case "scope.finality.final":
      return {
        t,
        head:   `Finality cert issued · round ${event.round} ·`,
        em:     `score ${event.payload.score.toFixed(3)}`,
        accent: "ok",
      };

    case "scope.veto.activated":
      return {
        t,
        head:   "Veto activated:",
        em:     event.reason ?? `by ${event.activatedBy}`,
        accent: "risk",
      };

    case "scope.veto.lifted":
      return {
        t,
        head:   "Veto lifted by",
        em:     event.liftedBy,
        accent: "ok",
      };

    case "model.connected":
      return { t, head: "Model connected:", em: event.handle, accent: "blue" };

    case "model.revoked":
      return { t, head: "Model revoked:", em: event.handle, accent: "fog" };

    case "agent.heartbeat":
      return {
        t,
        head: `Agent ${event.status}:`,
        em:   event.agentId,
        accent: event.status === "error" ? "risk" : "fog",
      };

    case "agent.task.started":
      return { t, head: "Agent task started ·", em: event.agentId };

    case "agent.task.completed":
      return {
        t,
        head:   `Task completed in ${event.durationMs} ms ·`,
        em:     event.agentId,
        accent: "ok",
      };

    case "agent.task.failed":
      return { t, head: "Task failed:", em: event.error, accent: "risk" };

    default:
      // Forward-compatible: unknown future event types show a minimal row
      return { t, head: "Event", em: (event as { type: string }).type };
  }
}

const ACCENT_COLOR: Record<Accent, string> = {
  ok:    "text-ok",
  risk:  "text-risk",
  amber: "text-amber",
  blue:  "text-blue",
  fog:   "text-fog",
};

// ─── Static placeholder rows (shown before SSE events arrive) ────────────────

const PLACEHOLDER_ROWS: DisplayRow[] = [
  { t: "—:——", head: "Waiting for live events…", accent: "fog" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityCard({ events }: { events: SgrsEvent[] }) {
  const rows: DisplayRow[] =
    events.length > 0 ? events.map(describe) : PLACEHOLDER_ROWS;

  return (
    <Card>
      <CardTitle>Recent activity</CardTitle>
      <div className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-[54px_1fr] gap-2 text-[12px] text-fog"
          >
            <span className="font-mono text-[11px] tabular-nums">{row.t}</span>
            <span className="leading-[1.45]">
              <span className={cn("text-mist", row.accent && ACCENT_COLOR[row.accent])}>
                {row.head}
              </span>
              {row.em && (
                <span className="ml-1 text-fog">{row.em}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
