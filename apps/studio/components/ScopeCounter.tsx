"use client";

/**
 * ScopeCounter — thin horizontal bar showing live scope metrics.
 *
 * Each cell flashes briefly (blue bg highlight that fades out) when its value
 * changes. Change detection uses a ref to hold the previous value so the flash
 * triggers only on genuine data updates, never on initial mount.
 *
 * Shown above the graph area in BusinessMode.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@sgrs/ui";
import type { ApiFinalityStatus } from "@/lib/hooks/useFinality";
import type { ApiRisk } from "@/lib/api-client";

// ─── Change-detecting cell ─────────────────────────────────────────────────────

interface CounterCellProps {
  label: string;
  value: string | number;
  /** Tailwind text-color class applied to the value (default: text-mist). */
  accent?: string;
  /** If true, a divider is rendered after this cell. */
  divided?: boolean;
}

function CounterCell({ label, value, accent = "text-mist", divided }: CounterCellProps) {
  const prevRef = useRef<string | number>(value);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value;
      setFlashing(true);
      const id = setTimeout(() => setFlashing(false), 700);
      return () => clearTimeout(id);
    }
  }, [value]);

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors duration-[600ms]",
          flashing ? "bg-blue/15" : "bg-transparent",
        )}
      >
        <span className={cn("font-mono text-[12.5px] font-semibold leading-none tabular-nums", accent)}>
          {value}
        </span>
        <span className="text-[9.5px] uppercase tracking-[0.8px] text-fog">{label}</span>
      </div>
      {divided && <div className="h-3 w-px shrink-0 bg-graphite" />}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RISK_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function topRiskLevel(risks: ApiRisk[]): string {
  if (risks.length === 0) return "—";
  return risks.reduce<string>((max, r) => {
    return (RISK_ORDER[r.level] ?? 0) > (RISK_ORDER[max] ?? 0) ? r.level : max;
  }, risks[0]!.level);
}

const RISK_ACCENT: Record<string, string> = {
  critical: "text-risk",
  high:     "text-risk",
  medium:   "text-amber",
  low:      "text-ok",
  "—":      "text-fog",
};

// ─── Component ────────────────────────────────────────────────────────────────

export interface ScopeCounterProps {
  finalityStatus: ApiFinalityStatus | null;
  claims: number;
  openContradictions: number;
  risks: ApiRisk[];
  currentRound: number | null;
}

export function ScopeCounter({
  finalityStatus,
  claims,
  openContradictions,
  risks,
  currentRound,
}: ScopeCounterProps) {
  const score = finalityStatus?.score;
  const rate  = finalityStatus?.convergence_rate;

  // ── Derived display values ─────────────────────────────────────────────────

  const roundStr = currentRound !== null ? String(currentRound) : "—";

  const scoreTrend = rate !== undefined
    ? rate > 0.01 ? " ↑" : rate < -0.01 ? " ↓" : ""
    : "";
  const scoreStr = score !== undefined ? `${score.toFixed(3)}${scoreTrend}` : "—";
  const scoreAccent =
    rate !== undefined && rate > 0.01  ? "text-ok"   :
    rate !== undefined && rate < -0.01 ? "text-risk"  :
    "text-mist";

  const deltaStr = rate !== undefined
    ? `${rate >= 0 ? "+" : ""}${rate.toFixed(3)}`
    : "—";
  const deltaAccent =
    rate === undefined  ? "text-fog"  :
    rate > 0.01         ? "text-ok"   :
    rate < -0.01        ? "text-risk"  :
    "text-fog";

  const claimsStr  = String(claims);
  const issuesStr  = String(openContradictions);
  const riskLabel  = topRiskLevel(risks).toUpperCase();
  const riskAccent = RISK_ACCENT[topRiskLevel(risks)] ?? "text-fog";

  return (
    <div className="flex h-8 shrink-0 items-center gap-0 border-b border-graphite bg-ink-soft px-2">
      <CounterCell label="Round"  value={roundStr}   accent="text-blue"  divided />
      <CounterCell label="Score"  value={scoreStr}   accent={scoreAccent} divided />
      <CounterCell label="Δ"      value={deltaStr}   accent={deltaAccent} divided />
      <CounterCell label="Claims" value={claimsStr}  accent={claims > 0 ? "text-mist" : "text-fog"} divided />
      <CounterCell
        label="Issues"
        value={issuesStr}
        accent={openContradictions > 0 ? "text-risk" : "text-fog"}
        divided
      />
      <CounterCell label="Risk" value={riskLabel}   accent={riskAccent} />

      {/* State label — far right */}
      {finalityStatus?.state && (
        <span className="ml-auto font-mono text-[10px] text-fog">
          {finalityStatus.state}
        </span>
      )}
    </div>
  );
}
