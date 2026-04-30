import { cn } from "@sgrs/ui";
import { Card, CardTitle } from "./Card";
import type { ApiFinalityStatus } from "@/lib/hooks/useFinality";
import type { ScopeItem } from "@/lib/types";

// ─── Display mappings ─────────────────────────────────────────────────────────

/** Map API state enum values to a business-friendly label + Tailwind colour. */
const STATE_DISPLAY: Record<string, { label: string; color: string }> = {
  active:     { label: "converging",              color: "text-blue"  },
  "near-final": { label: "near-finality",         color: "text-amber" },
  resolved:   { label: "resolved",                color: "text-ok"    },
  escalated:  { label: "escalated — review needed", color: "text-risk" },
  archived:   { label: "archived",                color: "text-fog"   },
};

const FINALITY_TARGET = 0.92;

function deriveTrend(rate: number): { label: string; color: string } {
  if (rate > 0.015)  return { label: `↑ +${rate.toFixed(3)}/cycle`, color: "text-ok"   };
  if (rate < -0.015) return { label: `↓ ${rate.toFixed(3)}/cycle`,  color: "text-risk" };
  return               { label: "→ stable",                          color: "text-fog"  };
}

function estimateEta(score: number, rate: number): string {
  if (score >= FINALITY_TARGET) return "reached";
  if (rate <= 0.001) return "—";
  const cycles = Math.ceil((FINALITY_TARGET - score) / rate);
  return `~${cycles} cycle${cycles !== 1 ? "s" : ""}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  scope: ScopeItem;
  /** Live finality status — null before the first successful fetch. */
  finalityStatus: ApiFinalityStatus | null;
  isLoading: boolean;
}

export function ProgressCard({ scope, finalityStatus: status, isLoading }: Props) {
  // Prefer fresher finality data; fall back to scope-level snapshot
  const score = status?.score        ?? scope.score;
  const state = status?.state        ?? scope.state;
  const rate  = status?.convergence_rate ?? null;

  const c      = 2 * Math.PI * 33;
  const offset = c * (1 - score);

  const stateDisplay = STATE_DISPLAY[state] ?? { label: state, color: "text-fog" };
  const trend = rate !== null ? deriveTrend(rate) : null;
  const eta   = rate !== null ? estimateEta(score, rate) : null;

  return (
    <Card tight>
      <CardTitle>Progress</CardTitle>
      <div className="grid grid-cols-[72px_1fr] items-center gap-4">

        {/* ── Score ring ───────────────────────────────────────────────────── */}
        <div className="relative h-[72px] w-[72px]">
          <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
            <defs>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#3e6b93" />
                <stop offset="100%" stopColor="#6aa6d6" />
              </linearGradient>
            </defs>
            {/* Track */}
            <circle
              cx="40" cy="40" r="33"
              fill="none"
              stroke="var(--dxm-graphite)"
              strokeWidth={5}
            />
            {/* Progress arc — CSS transition on dashoffset gives a smooth sweep */}
            <circle
              cx="40" cy="40" r="33"
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 0.7s ease" }}
            />
          </svg>
          <div className="absolute inset-0 grid place-content-center">
            <div className="font-mono text-[17px] leading-none text-mist">
              {score.toFixed(2)}
            </div>
          </div>
        </div>

        {/* ── Stats ────────────────────────────────────────────────────────── */}
        <div className="text-[12px]">
          <div className={cn("mb-1.5 text-[12.5px] font-medium", stateDisplay.color)}>
            {stateDisplay.label}
            {isLoading && (
              <span className="ml-1.5 font-normal text-[10px] text-fog opacity-60">
                …
              </span>
            )}
          </div>

          <Row label="trend">
            {trend ? (
              <b className={cn("font-mono font-medium", trend.color)}>{trend.label}</b>
            ) : (
              <b className="font-mono font-medium text-fog">—</b>
            )}
          </Row>

          <Row label={`ETA to ${FINALITY_TARGET}`}>
            <b className="font-mono font-medium text-mist">{eta ?? "—"}</b>
          </Row>

          <Row label="cycles">
            <b className="font-mono font-medium text-mist">{scope.cycles}</b>
          </Row>
        </div>
      </div>
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between py-0.5 text-[11.5px] text-fog">
      <span>{label}</span>
      {children}
    </div>
  );
}
