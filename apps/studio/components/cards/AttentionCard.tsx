import { Card, CardTitle } from "./Card";
import { cn } from "@sgrs/ui";
import type { ApiFinalityStatus } from "@/lib/hooks/useFinality";
import type { ScopeItem } from "@/lib/types";

// ─── Business-friendly dimension labels ──────────────────────────────────────

const DIM_LABELS: Record<string, string> = {
  claim_confidence:        "Claim confidence",
  contradiction_resolution:"Contradiction resolution",
  goal_completion:         "Goal completion",
  risk_score_inverse:      "Risk mitigation",
};

function dimLabel(key: string): string {
  return DIM_LABELS[key] ?? key.replace(/_/g, " ");
}

// ─── Derive attention state from live data ───────────────────────────────────

type AttentionLevel = "clear" | "info" | "warn" | "critical" | "veto" | "escalated";

interface AttentionState {
  level: AttentionLevel;
  title: string;
  body: string;
  /** Dimension key that is the primary blocker, if any */
  blockerDim?: string;
  blockerScore?: number;
}

function deriveAttention(
  finalityStatus: ApiFinalityStatus | null,
  scope: ScopeItem,
): AttentionState {
  const state = finalityStatus?.state ?? scope.state;

  // ── Resolved — nothing to do ───────────────────────────────────────────────
  if (state === "resolved" || state === "archived") {
    return {
      level: "clear",
      title: "All clear",
      body:  "All governance dimensions converged. Finality certificate issued.",
    };
  }

  // ── Escalated — waiting on T3 LLM governance ──────────────────────────────
  if (state === "escalated") {
    return {
      level: "escalated",
      title: "Escalated — awaiting review",
      body:  "The swarm has plateaued and escalated to Tier-3 LLM governance. No business action required — monitoring.",
    };
  }

  // ── Veto active (takes precedence over dimension issues) ──────────────────
  if (finalityStatus?.veto_active) {
    const perDim: Record<string, number> = finalityStatus.per_dimension ?? {};
    const worstKey = lowestDim(perDim);
    const body = worstKey
      ? `Veto is blocking convergence. ${dimLabel(worstKey)} is the weakest dimension at ${(perDim[worstKey]! * 100).toFixed(0)}%. Resolve the underlying conflict to lift the veto.`
      : "A governance veto is active and blocking convergence. The triggering issue must be resolved before the swarm can proceed.";
    return { level: "veto", title: "Veto active", body, blockerDim: worstKey };
  }

  // ── Inspect per-dimension scores ──────────────────────────────────────────
  const perDim: Record<string, number> = finalityStatus?.per_dimension ?? {};
  const keys   = Object.keys(perDim);

  if (keys.length > 0) {
    const worstKey = lowestDim(perDim)!;
    const worst    = perDim[worstKey]!;

    if (worst < 0.5) {
      return {
        level:        "critical",
        title:        "Critical — convergence blocked",
        body:         `${dimLabel(worstKey)} is at ${(worst * 100).toFixed(0)}% — well below the veto threshold. This dimension is actively blocking finality.`,
        blockerDim:   worstKey,
        blockerScore: worst,
      };
    }
    if (worst < 0.70) {
      return {
        level:        "warn",
        title:        "Needs attention",
        body:         `${dimLabel(worstKey)} is at ${(worst * 100).toFixed(0)}% and below the 70% threshold. Review is recommended to unblock convergence.`,
        blockerDim:   worstKey,
        blockerScore: worst,
      };
    }
    if (worst < 0.85) {
      return {
        level:        "info",
        title:        "Minor gap",
        body:         `${dimLabel(worstKey)} is at ${(worst * 100).toFixed(0)}%. All other dimensions are healthy. Close this gap to reach finality.`,
        blockerDim:   worstKey,
        blockerScore: worst,
      };
    }
    // All dimensions ≥ 0.85
    return {
      level: "clear",
      title: "All dimensions healthy",
      body:  `All governance dimensions are above 85%. Score ${finalityStatus?.score.toFixed(3) ?? scope.score.toFixed(3)} — approaching finality threshold.`,
    };
  }

  // ── No finality data yet — generic converging state ───────────────────────
  return {
    level: "info",
    title: "Converging",
    body:  "The swarm is running. Governance dimensions will appear once the first convergence cycle completes.",
  };
}

/** Return the key with the lowest value in a partial record. */
function lowestDim(dims: Record<string, number>): string | undefined {
  const entries = Object.entries(dims);
  if (entries.length === 0) return undefined;
  return entries.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  finalityStatus: ApiFinalityStatus | null;
  scope: ScopeItem;
}

export function AttentionCard({ finalityStatus, scope }: Props) {
  const attention = deriveAttention(finalityStatus, scope);

  const isClear = attention.level === "clear";
  const isVeto  = attention.level === "veto";
  const isBad   = attention.level === "critical" || isVeto;

  // Card border / background tint changes with severity
  const cardClass = cn(
    "relative overflow-hidden",
    isBad
      ? "border-risk/25 bg-gradient-to-br from-risk/[0.04] to-transparent"
      : attention.level === "warn"
        ? "border-amber/25 bg-gradient-to-br from-amber/[0.04] to-transparent"
        : attention.level === "escalated"
          ? "border-blue/25 bg-gradient-to-br from-blue/[0.04] to-transparent"
          : isClear
            ? "border-ok/20 bg-gradient-to-br from-ok/[0.03] to-transparent"
            : undefined,
  );

  const titleColor = isBad
    ? "text-risk"
    : attention.level === "warn"
      ? "text-amber"
      : attention.level === "escalated"
        ? "text-blue"
        : isClear
          ? "text-ok"
          : "text-fog";

  const dot = isBad || attention.level === "warn";

  return (
    <Card className={cardClass}>
      <CardTitle className={cn("flex items-center gap-2", titleColor)}>
        {dot && (
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              isBad ? "bg-risk dxm-pulse" : "bg-amber dxm-pulse",
            )}
          />
        )}
        {attention.title}
      </CardTitle>

      <p className="mb-3 text-[13px] leading-[1.55] text-mist">
        {attention.body}
      </p>

      {/* Dimension score pill — shown when a specific dimension is the blocker */}
      {attention.blockerDim && attention.blockerScore !== undefined && (
        <div className="mb-3 flex items-center gap-2">
          <span className="font-mono text-[11px] text-fog">
            {dimLabel(attention.blockerDim)}
          </span>
          <div className="h-[3px] flex-1 overflow-hidden rounded-[2px] bg-graphite">
            <div
              className={cn(
                "h-full rounded-[2px] transition-all duration-700",
                attention.blockerScore < 0.5
                  ? "bg-risk"
                  : attention.blockerScore < 0.7
                    ? "bg-amber"
                    : "bg-blue",
              )}
              style={{ width: `${attention.blockerScore * 100}%` }}
            />
          </div>
          <span className="font-mono text-[11px] text-fog">
            {(attention.blockerScore * 100).toFixed(0)}%
          </span>
        </div>
      )}

      {/* Action buttons — only visible when there's something actionable */}
      {!isClear && attention.level !== "escalated" && (
        <div className="flex gap-1.5">
          <button
            className="rounded-[7px] border border-orange bg-orange px-3.5 py-1.5 text-[12.5px] font-medium text-[#1a0d00] transition-colors duration-smooth hover:bg-orange-soft"
            aria-label={`Review ${attention.blockerDim ? dimLabel(attention.blockerDim) : "governance issue"}`}
          >
            Review
          </button>
          <button
            className="rounded-[7px] border border-transparent bg-transparent px-3.5 py-1.5 text-[12.5px] text-fog-2 transition-colors duration-smooth hover:border-graphite-2"
            aria-label="Defer this item"
          >
            Defer
          </button>
        </div>
      )}
    </Card>
  );
}
