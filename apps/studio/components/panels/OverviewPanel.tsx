"use client";

import { cn } from "@sgrs/ui";
import type { ApiFinalityStatus } from "@/lib/hooks/useFinality";
import type { ScopeItem } from "@/lib/types";
import type { ApiRisk, ApiDrift } from "@/lib/api-client";
import type { SgrsEvent } from "@sgrs/client-ts";
import { AttentionCard } from "../cards/AttentionCard";
import { ActivityCard } from "../cards/ActivityCard";

// ─── Risk level badge ─────────────────────────────────────────────────────────

const RISK_CONFIG = {
  critical: { label: "Critical risk",  bg: "bg-risk/10",   text: "text-risk",  border: "border-risk/30"  },
  high:     { label: "High risk",      bg: "bg-amber/10",  text: "text-amber", border: "border-amber/30" },
  medium:   { label: "Medium risk",    bg: "bg-blue/10",   text: "text-blue",  border: "border-blue/30"  },
  low:      { label: "Low risk",       bg: "bg-ok/10",     text: "text-ok",    border: "border-ok/30"    },
  none:     { label: "No risks yet",   bg: "bg-graphite",  text: "text-fog",   border: "border-graphite" },
};

function topRiskLevel(risks: ApiRisk[]): keyof typeof RISK_CONFIG {
  if (risks.some((r) => r.level === "critical")) return "critical";
  if (risks.some((r) => r.level === "high"))     return "high";
  if (risks.some((r) => r.level === "medium"))   return "medium";
  if (risks.some((r) => r.level === "low"))      return "low";
  return "none";
}

// ─── Drift row ────────────────────────────────────────────────────────────────

function DriftRow({ drift }: { drift: ApiDrift }) {
  const isNeg = drift.delta < 0;
  return (
    <div className="flex items-center gap-2.5 py-1.5 text-[12px]">
      <span className={cn(
        "shrink-0 rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.6px]",
        drift.severity === "high"   ? "bg-risk/15 text-risk"  :
        drift.severity === "medium" ? "bg-amber/15 text-amber" :
                                      "bg-fog/10 text-fog",
      )}>
        {drift.severity}
      </span>
      <span className="flex-1 truncate text-mist">{drift.subject}</span>
      <span className={cn("font-mono text-[11px]", isNeg ? "text-risk" : "text-ok")}>
        {isNeg ? "" : "+"}{drift.delta.toFixed(3)}
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  scope: ScopeItem;
  finalityStatus: ApiFinalityStatus | null;
  risks: ApiRisk[];
  drifts: ApiDrift[];
  activityEvents: SgrsEvent[];
}

export function OverviewPanel({ scope, finalityStatus, risks, drifts, activityEvents }: Props) {
  const riskLevel = topRiskLevel(risks);
  const { label, bg, text, border } = RISK_CONFIG[riskLevel];

  // Top 3 significant drifts
  const topDrifts = drifts
    .filter((d) => d.severity !== "low")
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* ── Risk level banner ─────────────────────────────────────────────── */}
      <div className={cn(
        "flex items-center gap-2.5 rounded border px-3 py-2.5",
        bg, border,
      )}>
        <span className={cn("h-2 w-2 shrink-0 rounded-full", `bg-${riskLevel === "none" ? "fog" : riskLevel === "low" ? "ok" : riskLevel === "medium" ? "blue" : riskLevel === "high" ? "amber" : "risk"}`)} />
        <span className={cn("text-[12.5px] font-medium", text)}>{label}</span>
        {risks.length > 0 && (
          <span className="ml-auto font-mono text-[10.5px] text-fog">
            {risks.length} item{risks.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── Attention card ─────────────────────────────────────────────────── */}
      <AttentionCard finalityStatus={finalityStatus} scope={scope} />

      {/* ── Significant drifts ────────────────────────────────────────────── */}
      {topDrifts.length > 0 && (
        <section className="rounded border border-graphite bg-ink-soft px-3 py-2.5">
          <div className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.9px] text-fog">
            Significant drifts
          </div>
          {topDrifts.map((d) => <DriftRow key={d.id} drift={d} />)}
        </section>
      )}

      {/* ── Activity feed ─────────────────────────────────────────────────── */}
      <ActivityCard events={activityEvents} />
    </div>
  );
}
